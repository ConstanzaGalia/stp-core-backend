import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThanOrEqual } from 'typeorm';
import { Payment, PaymentStatus, PaymentMethod } from '../../entities/payment.entity';
import { PaymentPlan } from '../../entities/payment-plan.entity';
import { UserPaymentSubscription, SubscriptionStatus } from '../../entities/user-payment-subscription.entity';
import { ClassUsage, ClassUsageType } from '../../entities/class-usage.entity';
import { User } from '../../entities/user.entity';
import { Company } from '../../entities/company.entity';
import { SubscriptionSuspension } from '../../entities/subscription-suspension.entity';
import { CreatePaymentPlanDto } from './dto/create-payment-plan.dto';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { CompletePaymentDto } from './dto/complete-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { CreateSuspensionDto } from './dto/create-suspension.dto';
import { UpdateSuspensionDto } from './dto/update-suspension.dto';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(PaymentPlan)
    private readonly paymentPlanRepository: Repository<PaymentPlan>,
    @InjectRepository(UserPaymentSubscription)
    private readonly subscriptionRepository: Repository<UserPaymentSubscription>,
    @InjectRepository(ClassUsage)
    private readonly classUsageRepository: Repository<ClassUsage>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(SubscriptionSuspension)
    private readonly suspensionRepository: Repository<SubscriptionSuspension>,
  ) {}

  // ===== PLANES DE PAGO =====
  async createPaymentPlan(companyId: string, createPaymentPlanDto: CreatePaymentPlanDto): Promise<PaymentPlan> {
    const company = await this.companyRepository.findOne({ where: { id: companyId } });
    if (!company) {
      throw new NotFoundException('Company not found');
    }

    const paymentPlan = this.paymentPlanRepository.create({
      ...createPaymentPlanDto,
      frequencyDays: 30, // Siempre 30 días
      totalInstallments: 1, // Siempre 1 cuota
      isRecurring: true, // Siempre se renueva
      company: { id: companyId }
    });

    return await this.paymentPlanRepository.save(paymentPlan);
  }

  async getPaymentPlans(companyId: string): Promise<PaymentPlan[]> {
    return await this.paymentPlanRepository.find({
      where: { company: { id: companyId }, isActive: true },
      order: { classesPerWeek: 'ASC' }
    });
  }

  async updatePaymentPlan(id: string, updateData: Partial<CreatePaymentPlanDto>): Promise<PaymentPlan> {
    const paymentPlan = await this.paymentPlanRepository.findOne({ where: { id } });
    if (!paymentPlan) {
      throw new NotFoundException('Payment plan not found');
    }

    // Validar que los datos sean coherentes
    if (updateData.classesPerWeek && updateData.maxClassesPerPeriod) {
      const minClasses = updateData.classesPerWeek * 4;
      if (updateData.maxClassesPerPeriod < minClasses) {
        throw new BadRequestException(
          `maxClassesPerPeriod debe ser al menos ${minClasses} para ${updateData.classesPerWeek} clases por semana`
        );
      }
    }

    Object.assign(paymentPlan, updateData);
    return await this.paymentPlanRepository.save(paymentPlan);
  }

  async deletePaymentPlan(id: string): Promise<void> {
    const paymentPlan = await this.paymentPlanRepository.findOne({ 
      where: { id },
      relations: ['userSubscriptions']
    });
    
    if (!paymentPlan) {
      throw new NotFoundException('Payment plan not found');
    }

    if (paymentPlan.userSubscriptions && paymentPlan.userSubscriptions.length > 0) {
      throw new BadRequestException('Cannot delete payment plan with active subscriptions');
    }

    await this.paymentPlanRepository.remove(paymentPlan);
  }

  // ===== SUSCRIPCIONES =====
  async createSubscription(companyId: string, createSubscriptionDto: CreateSubscriptionDto): Promise<UserPaymentSubscription> {
    const [user, paymentPlan, company] = await Promise.all([
      this.userRepository.findOne({ where: { id: createSubscriptionDto.userId } }),
      this.paymentPlanRepository.findOne({ 
        where: { id: createSubscriptionDto.paymentPlanId },
        relations: ['company']
      }),
      this.companyRepository.findOne({ where: { id: companyId } })
    ]);

    if (!user) throw new NotFoundException('User not found');
    if (!paymentPlan) throw new NotFoundException('Payment plan not found');
    if (!company) throw new NotFoundException('Company not found');

    // Verificar que el plan pertenece a la empresa
    if (paymentPlan.company.id !== companyId) {
      throw new BadRequestException('Payment plan does not belong to this company');
    }

    const startDate = new Date(createSubscriptionDto.startDate);
    const periodStartDate = startDate;
    const periodEndDate = new Date(startDate);
    periodEndDate.setDate(periodEndDate.getDate() + 30); // 30 días exactos

    const nextBillingDate = new Date(periodEndDate);

    const subscription = this.subscriptionRepository.create({
      ...createSubscriptionDto,
      startDate: periodStartDate,
      endDate: null, // No tiene fecha de fin (es recurrente)
      nextBillingDate,
      totalInstallments: 1,
      pendingInstallments: 1,
      classesUsedThisPeriod: 0,
      classesRemainingThisPeriod: paymentPlan.maxClassesPerPeriod,
      periodStartDate,
      periodEndDate,
      autoRenew: true, // Siempre se renueva
      company: { id: companyId },
      user: { id: createSubscriptionDto.userId },
      paymentPlan: { id: createSubscriptionDto.paymentPlanId }
    });

    const savedSubscription = await this.subscriptionRepository.save(subscription);

    // Cargar las relaciones necesarias para generar el pago
    const subscriptionWithRelations = await this.subscriptionRepository.findOne({
      where: { id: savedSubscription.id },
      relations: ['paymentPlan', 'user', 'company']
    });

    // Generar la primera cuota mensual
    await this.generateMonthlyPayment(subscriptionWithRelations);

    return savedSubscription;
  }

  async getSubscriptions(companyId: string, status?: SubscriptionStatus): Promise<UserPaymentSubscription[]> {
    const whereClause: any = { company: { id: companyId } };
    if (status) {
      whereClause.status = status;
    }

    return await this.subscriptionRepository.find({
      where: whereClause,
      relations: ['user', 'paymentPlan'],
      order: { createdAt: 'DESC' }
    });
  }

  async getUserSubscriptions(userId: string): Promise<UserPaymentSubscription[]> {
    return await this.subscriptionRepository.find({
      where: { user: { id: userId } },
      relations: ['paymentPlan', 'company'],
      order: { createdAt: 'DESC' }
    });
  }

  // ===== GENERACIÓN DE PAGOS MENSUALES =====
  async generateMonthlyPayment(subscription: UserPaymentSubscription): Promise<Payment> {
    const paymentPlan = subscription.paymentPlan;
    
    if (!paymentPlan || !paymentPlan.amount) {
      throw new BadRequestException('Payment plan or amount not found');
    }

    const dueDate = new Date(subscription.periodStartDate);
    dueDate.setDate(dueDate.getDate() + (paymentPlan.gracePeriodDays || 0));

    const payment = this.paymentRepository.create({
      amount: paymentPlan.amount,
      totalAmount: paymentPlan.amount,
      status: PaymentStatus.PENDING,
      dueDate,
      instalmentNumber: 1, // Siempre 1 por período
      user: { id: subscription.user.id },
      company: { id: subscription.company.id },
      paymentPlan: { id: paymentPlan.id },
      subscription: { id: subscription.id }
    });

    return await this.paymentRepository.save(payment);
  }

  // ===== GESTIÓN DE CLASES =====
  async canUserBookClass(subscriptionId: string): Promise<boolean> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { id: subscriptionId },
      relations: ['paymentPlan']
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    // Verificar que la suscripción esté activa
    if (subscription.status !== SubscriptionStatus.ACTIVE) {
      return false;
    }

    // Verificar que tenga clases disponibles
    if (subscription.classesRemainingThisPeriod <= 0) {
      return false;
    }

    // Verificar que no haya cuotas pendientes
    const pendingPayment = await this.paymentRepository.findOne({
      where: {
        subscription: { id: subscriptionId },
        status: PaymentStatus.PENDING
      }
    });

    return !pendingPayment; // Solo puede reservar si no tiene cuotas pendientes
  }

  async registerClassUsage(subscriptionId: string, usageData: {
    type: ClassUsageType;
    usageDate: Date;
    notes?: string;
  }): Promise<ClassUsage> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { id: subscriptionId },
      relations: ['user', 'company', 'paymentPlan']
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    // Verificar que pueda usar la clase
    if (!(await this.canUserBookClass(subscriptionId))) {
      throw new BadRequestException('User cannot book class at this time');
    }

    // Crear registro de uso de clase
    const classUsage = this.classUsageRepository.create({
      ...usageData,
      user: { id: subscription.user.id },
      company: { id: subscription.company.id },
      subscription: { id: subscriptionId }
    });

    const savedClassUsage = await this.classUsageRepository.save(classUsage);

    // Actualizar contadores de la suscripción
    subscription.classesUsedThisPeriod += 1;
    subscription.classesRemainingThisPeriod -= 1;
    await this.subscriptionRepository.save(subscription);

    return savedClassUsage;
  }

  async getClassStatus(subscriptionId: string): Promise<any> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { id: subscriptionId },
      relations: ['user', 'paymentPlan']
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    const pendingPayment = await this.paymentRepository.findOne({
      where: {
        subscription: { id: subscriptionId },
        status: PaymentStatus.PENDING
      }
    });

    return {
      subscriptionId: subscription.id,
      userName: `${subscription.user.name} ${subscription.user.lastName}`,
      planName: subscription.paymentPlan.name,
      classesPerWeek: subscription.paymentPlan.classesPerWeek,
      maxClassesPerPeriod: subscription.paymentPlan.maxClassesPerPeriod,
      classesUsedThisPeriod: subscription.classesUsedThisPeriod,
      classesRemainingThisPeriod: subscription.classesRemainingThisPeriod,
      periodStartDate: subscription.periodStartDate,
      periodEndDate: subscription.periodEndDate,
      canBookClass: await this.canUserBookClass(subscriptionId),
      hasPendingPayment: !!pendingPayment,
      paymentAmount: pendingPayment?.amount || 0
    };
  }


  // ===== RENOVACIÓN DEL PERÍODO =====
  async renewPeriodSubscription(subscriptionId: string): Promise<UserPaymentSubscription> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { id: subscriptionId },
      relations: ['paymentPlan']
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    // Calcular fechas del nuevo período (30 días)
    const newPeriodStart = new Date(subscription.periodEndDate);
    const newPeriodEnd = new Date(newPeriodStart);
    newPeriodEnd.setDate(newPeriodEnd.getDate() + 30);

    const nextBillingDate = new Date(newPeriodEnd);

    // Calcular clases que pasan al siguiente período
    let rolloverClasses = 0;
    if (subscription.paymentPlan.allowClassRollover) {
      rolloverClasses = Math.min(
        subscription.classesRemainingThisPeriod,
        subscription.paymentPlan.maxRolloverClasses || 0
      );
    }

    // Actualizar suscripción para el nuevo período
    subscription.periodStartDate = newPeriodStart;
    subscription.periodEndDate = newPeriodEnd;
    subscription.nextBillingDate = nextBillingDate;
    subscription.classesUsedThisPeriod = 0;
    subscription.classesRemainingThisPeriod = subscription.paymentPlan.maxClassesPerPeriod + rolloverClasses;
    subscription.paidInstallments = 0;
    subscription.pendingInstallments = 1;

    const updatedSubscription = await this.subscriptionRepository.save(subscription);

    // Generar nueva cuota
    await this.generateMonthlyPayment(updatedSubscription);

    return updatedSubscription;
  }

  // ===== REPORTES =====
  async getPeriodReport(companyId: string, startDate: string, endDate: string): Promise<any> {
    const start = new Date(startDate);
    const end = new Date(endDate);

    const subscriptions = await this.subscriptionRepository.find({
      where: {
        company: { id: companyId },
        periodStartDate: Between(start, end)
      },
      relations: ['user', 'paymentPlan', 'payments']
    });

    const totalSubscriptions = subscriptions.length;
    const activeSubscriptions = subscriptions.filter(s => s.status === SubscriptionStatus.ACTIVE).length;
    const totalRevenue = subscriptions.reduce((sum, s) => {
      const payment = s.payments.find(p => p.status === PaymentStatus.PAID);
      return sum + (payment ? Number(payment.totalAmount) : 0);
    }, 0);

    const classUsageStats = subscriptions.reduce((stats, s) => {
      stats.totalClasses += s.paymentPlan.maxClassesPerPeriod;
      stats.usedClasses += s.classesUsedThisPeriod;
      stats.remainingClasses += s.classesRemainingThisPeriod;
      return stats;
    }, { totalClasses: 0, usedClasses: 0, remainingClasses: 0 });

    return {
      startDate: startDate,
      endDate: endDate,
      totalSubscriptions,
      activeSubscriptions,
      totalRevenue,
      classUsageStats,
      subscriptions: subscriptions.map(s => ({
        id: s.id,
        userName: `${s.user.name} ${s.user.lastName}`,
        planName: s.paymentPlan.name,
        classesUsed: s.classesUsedThisPeriod,
        classesRemaining: s.classesRemainingThisPeriod,
        status: s.status,
        hasPaid: s.payments.some(p => p.status === PaymentStatus.PAID)
      }))
    };
  }

  // ===== UTILIDADES =====
  async calculateLateFees(): Promise<void> {
    const today = new Date();
    const overduePayments = await this.paymentRepository.find({
      where: {
        status: PaymentStatus.PENDING,
        dueDate: LessThanOrEqual(today)
      },
      relations: ['subscription', 'subscription.paymentPlan']
    });

    for (const payment of overduePayments) {
      const daysLate = Math.floor((today.getTime() - payment.dueDate.getTime()) / (1000 * 60 * 60 * 24));
      const gracePeriod = payment.subscription.paymentPlan.gracePeriodDays || 0;
      
      if (daysLate > gracePeriod) {
        const lateFee = (payment.amount * payment.subscription.paymentPlan.lateFeePercentage) / 100;
        payment.lateFee = lateFee;
        payment.totalAmount = payment.amount + lateFee;
        payment.status = PaymentStatus.OVERDUE;
        
        await this.paymentRepository.save(payment);
      }
    }
  }

  // ===== GESTIÓN DE ALUMNOS Y PAGOS =====
  async getStudentsWithPayments(companyId: string): Promise<any[]> {
    const subscriptions = await this.subscriptionRepository.find({
      where: { company: { id: companyId } },
      relations: [
        'user', 
        'paymentPlan', 
        'payments',
        'company'
      ],
      order: {
        user: { name: 'ASC' }
      }
    });

    return Promise.all(subscriptions.map(async (subscription) => {
      const pendingPayment = subscription.payments.find(p => p.status === PaymentStatus.PENDING);
      
      // Ordenar todos los pagos del más reciente al más antiguo
      // Usar paidDate si existe (pagos pagados), sino dueDate (pagos pendientes)
      const allPayments = subscription.payments
        .map(payment => ({
          id: payment.id,
          amount: payment.amount,
          totalAmount: payment.totalAmount,
          status: payment.status,
          paymentMethod: payment.paymentMethod,
          dueDate: payment.dueDate,
          paidDate: payment.paidDate,
          lateFee: payment.lateFee,
          discount: payment.discount,
          transactionId: payment.transactionId,
          notes: payment.notes,
          instalmentNumber: payment.instalmentNumber,
          sortDate: payment.paidDate || payment.dueDate
        }))
        .sort((a, b) => {
          // Si tiene paidDate, usar paidDate; si no, usar dueDate
          const dateA = a.sortDate ? new Date(a.sortDate).getTime() : 0;
          const dateB = b.sortDate ? new Date(b.sortDate).getTime() : 0;
          return dateB - dateA; // Más reciente primero
        });

      // Obtener suspensiones activas del alumno en este centro
      let activeSuspensions = [];
      if (subscription.user && subscription.company) {
        activeSuspensions = await this.suspensionRepository.find({
          where: {
            user: { id: subscription.user.id },
            company: { id: subscription.company.id },
            isActive: true
          }
        });
      }

      // Verificar si cada pago está en un período de suspensión
      const paymentsWithSuspension = allPayments.map(payment => {
        let isSuspended = false;
        const paymentDate = payment.paidDate || payment.dueDate;
        
        if (paymentDate && activeSuspensions.length > 0) {
          const date = new Date(paymentDate);
          isSuspended = activeSuspensions.some(suspension => {
            const startDate = new Date(suspension.startDate);
            const endDate = new Date(suspension.endDate);
            return date >= startDate && date <= endDate;
          });
        }

        return {
          id: payment.id,
          amount: payment.amount,
          totalAmount: payment.totalAmount,
          status: payment.status,
          paymentMethod: payment.paymentMethod,
          dueDate: payment.dueDate,
          paidDate: payment.paidDate,
          lateFee: payment.lateFee,
          discount: payment.discount,
          transactionId: payment.transactionId,
          notes: payment.notes,
          instalmentNumber: payment.instalmentNumber,
          isOverdue: payment.dueDate ? new Date(payment.dueDate) < new Date() && payment.status === PaymentStatus.PENDING : false,
          isSuspended: isSuspended
        };
      });

      return {
        studentId: subscription.user.id,
        studentName: `${subscription.user.name} ${subscription.user.lastName}`,
        studentEmail: subscription.user.email,
        studentPhone: subscription.user.phoneNumber,
        subscriptionId: subscription.id,
        planName: subscription.paymentPlan.name,
        planPrice: subscription.paymentPlan.amount,
        subscriptionStatus: subscription.status,
        periodStartDate: subscription.periodStartDate,
        periodEndDate: subscription.periodEndDate,
        classesUsed: subscription.classesUsedThisPeriod,
        classesRemaining: subscription.classesRemainingThisPeriod,
        maxClasses: subscription.paymentPlan.maxClassesPerPeriod,
        pendingPayment: pendingPayment ? {
          id: pendingPayment.id,
          amount: pendingPayment.amount,
          dueDate: pendingPayment.dueDate,
          lateFee: pendingPayment.lateFee,
          isOverdue: pendingPayment.dueDate ? new Date(pendingPayment.dueDate) < new Date() : false,
          isSuspended: paymentsWithSuspension.find(p => p.id === pendingPayment.id)?.isSuspended || false
        } : null,
        payments: paymentsWithSuspension, // Todos los pagos ordenados del más reciente al más antiguo
        activeSuspensions: activeSuspensions.map(suspension => ({
          id: suspension.id,
          startDate: suspension.startDate,
          endDate: suspension.endDate,
          reason: suspension.reason,
          notes: suspension.notes
        })),
        totalPayments: subscription.payments.length,
        paidPayments: subscription.payments.filter(p => p.status === PaymentStatus.PAID).length
      };
    }));
  }

  // ===== PAGO COMPLETO (SUSCRIPCIÓN + PAGO) =====
  async completePayment(completePaymentDto: CompletePaymentDto): Promise<{ subscription: UserPaymentSubscription; payment: Payment }> {
    const { userId, paymentPlanId, companyId, amount, paymentMethod, discount, transactionId, notes, startDate } = completePaymentDto;

    // 1. Verificar si ya existe una suscripción activa para este usuario y plan
    let existingSubscription = await this.subscriptionRepository.findOne({
      where: {
        user: { id: userId },
        paymentPlan: { id: paymentPlanId },
        company: { id: companyId },
        status: SubscriptionStatus.ACTIVE
      },
      relations: ['user', 'paymentPlan', 'company']
    });

    let subscription: UserPaymentSubscription;

    if (existingSubscription) {
      // Si ya existe una suscripción activa, usarla
      subscription = existingSubscription;
    } else {
      // Si no existe, crear una nueva suscripción
      const createSubscriptionDto: CreateSubscriptionDto = {
        userId,
        paymentPlanId,
        startDate: startDate || new Date().toISOString().split('T')[0], // Fecha de hoy si no se especifica
        autoRenew: true
      };

      subscription = await this.createSubscription(companyId, createSubscriptionDto);
    }

    // 2. Buscar el pago pendiente
    let pendingPayment = await this.paymentRepository.findOne({
      where: {
        subscription: { id: subscription.id },
        status: PaymentStatus.PENDING
      }
    });

    // Si no se encuentra el pago, intentar generar uno nuevo
    if (!pendingPayment) {
      // Si es una suscripción existente, generar un nuevo pago
      if (existingSubscription) {
        await this.generateMonthlyPayment(subscription);
        
        // Buscar el pago recién creado
        pendingPayment = await this.paymentRepository.findOne({
          where: {
            subscription: { id: subscription.id },
            status: PaymentStatus.PENDING
          }
        });
      } else {
        // Si es una suscripción nueva, esperar un poco y reintentar
        await new Promise(resolve => setTimeout(resolve, 100));
        
        pendingPayment = await this.paymentRepository.findOne({
          where: {
            subscription: { id: subscription.id },
            status: PaymentStatus.PENDING
          }
        });
      }
    }

    if (!pendingPayment) {
      throw new BadRequestException('No pending payments found for this subscription');
    }

    // Calcular recargo por mora si aplica
    let lateFee = 0;
    if (pendingPayment.dueDate < new Date()) {
      const daysLate = Math.floor((new Date().getTime() - pendingPayment.dueDate.getTime()) / (1000 * 60 * 60 * 24));
      const gracePeriod = subscription.paymentPlan.gracePeriodDays || 0;
      
      if (daysLate > gracePeriod) {
        lateFee = (pendingPayment.amount * subscription.paymentPlan.lateFeePercentage) / 100;
      }
    }

    // Actualizar el pago
    pendingPayment.status = PaymentStatus.PAID;
    pendingPayment.paymentMethod = paymentMethod;
    pendingPayment.paidDate = new Date();
    pendingPayment.lateFee = lateFee;
    pendingPayment.discount = discount || 0;
    pendingPayment.totalAmount = pendingPayment.amount + lateFee - (discount || 0);
    pendingPayment.transactionId = transactionId;
    pendingPayment.notes = notes;

    const payment = await this.paymentRepository.save(pendingPayment);

    // Marcar cuota como pagada
    subscription.paidInstallments = 1;
    subscription.pendingInstallments = 0;
    subscription.status = SubscriptionStatus.ACTIVE;
    await this.subscriptionRepository.save(subscription);

    return {
      subscription,
      payment
    };
  }

  // ===== GESTIÓN DE PAGOS INDIVIDUALES =====
  async updatePayment(paymentId: string, updatePaymentDto: UpdatePaymentDto): Promise<Payment> {
    const payment = await this.paymentRepository.findOne({
      where: { id: paymentId },
      relations: ['subscription', 'user', 'company']
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    // Actualizar campos si se proporcionan
    if (updatePaymentDto.amount !== undefined) {
      // Asegurar que amount sea un número
      payment.amount = Number(updatePaymentDto.amount);
    }
    if (updatePaymentDto.lateFee !== undefined) {
      // Asegurar que lateFee sea un número
      payment.lateFee = Number(updatePaymentDto.lateFee);
    }
    if (updatePaymentDto.discount !== undefined) {
      // Asegurar que discount sea un número
      payment.discount = Number(updatePaymentDto.discount);
    }
    if (updatePaymentDto.status !== undefined) {
      payment.status = updatePaymentDto.status;
    }
    if (updatePaymentDto.paymentMethod !== undefined) {
      payment.paymentMethod = updatePaymentDto.paymentMethod;
    }
    if (updatePaymentDto.transactionId !== undefined) {
      payment.transactionId = updatePaymentDto.transactionId;
    }
    if (updatePaymentDto.notes !== undefined) {
      payment.notes = updatePaymentDto.notes;
    }
    if (updatePaymentDto.dueDate !== undefined) {
      payment.dueDate = new Date(updatePaymentDto.dueDate);
    }
    if (updatePaymentDto.paidDate !== undefined) {
      payment.paidDate = new Date(updatePaymentDto.paidDate);
    }

    // Recalcular totalAmount si se modificó amount, lateFee o discount
    if (updatePaymentDto.amount !== undefined || 
        updatePaymentDto.lateFee !== undefined || 
        updatePaymentDto.discount !== undefined) {
      // Convertir explícitamente a números para evitar problemas con decimales
      // Asegurar que todos los valores sean números, incluso los existentes de la BD
      const amount = parseFloat(String(payment.amount || 0)) || 0;
      const lateFee = parseFloat(String(payment.lateFee || 0)) || 0;
      const discount = parseFloat(String(payment.discount || 0)) || 0;
      
      // Calcular totalAmount como suma de números
      payment.totalAmount = parseFloat((amount + lateFee - discount).toFixed(2));
    }

    return await this.paymentRepository.save(payment);
  }

  async deletePayment(paymentId: string): Promise<{ message: string }> {
    const payment = await this.paymentRepository.findOne({
      where: { id: paymentId },
      relations: ['subscription']
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    // Verificar que el pago no esté pagado (opcional - puedes cambiar esta lógica)
    if (payment.status === PaymentStatus.PAID) {
      throw new BadRequestException('Cannot delete a paid payment');
    }

    await this.paymentRepository.remove(payment);

    return { message: 'Payment deleted successfully' };
  }

  // ===== GESTIÓN DE SUSPENSIONES TEMPORALES =====
  // Función auxiliar para parsear fechas sin problemas de zona horaria
  private parseDateWithoutTimeZone(dateString: string): Date {
    // Si viene en formato YYYY-MM-DD, parsearlo directamente sin zona horaria
    const parts = dateString.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // Los meses en JS son 0-indexed
      const day = parseInt(parts[2], 10);
      return new Date(year, month, day);
    }
    // Si viene en otro formato, usar el constructor normal
    return new Date(dateString);
  }

  async createSuspension(createSuspensionDto: CreateSuspensionDto): Promise<SubscriptionSuspension> {
    const [user, company] = await Promise.all([
      this.userRepository.findOne({ where: { id: createSuspensionDto.userId } }),
      this.companyRepository.findOne({ where: { id: createSuspensionDto.companyId } })
    ]);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    const startDate = this.parseDateWithoutTimeZone(createSuspensionDto.startDate);
    const endDate = this.parseDateWithoutTimeZone(createSuspensionDto.endDate);

    if (startDate >= endDate) {
      throw new BadRequestException('End date must be after start date');
    }

    // Verificar que no haya otra suspensión activa en el mismo período para este alumno en este centro
    const existingSuspensions = await this.suspensionRepository.find({
      where: {
        user: { id: createSuspensionDto.userId },
        company: { id: createSuspensionDto.companyId },
        isActive: true,
      }
    });

    // Verificar si hay solapamiento de fechas
    const hasOverlap = existingSuspensions.some(existingSuspension => {
      // Las fechas de la BD ya vienen como Date, solo necesitamos compararlas
      const existingStart = existingSuspension.startDate instanceof Date 
        ? existingSuspension.startDate 
        : new Date(existingSuspension.startDate);
      const existingEnd = existingSuspension.endDate instanceof Date 
        ? existingSuspension.endDate 
        : new Date(existingSuspension.endDate);
      return !(endDate < existingStart || startDate > existingEnd);
    });

    if (hasOverlap) {
      throw new BadRequestException('There is already an active suspension for this period');
    }

    // Obtener la suscripción activa del alumno (si existe)
    const activeSubscription = await this.subscriptionRepository.findOne({
      where: {
        user: { id: createSuspensionDto.userId },
        company: { id: createSuspensionDto.companyId },
        status: SubscriptionStatus.ACTIVE
      }
    });

    const suspension = this.suspensionRepository.create({
      startDate,
      endDate,
      reason: createSuspensionDto.reason,
      notes: createSuspensionDto.notes,
      subscription: activeSubscription ? { id: activeSubscription.id } : null,
      user: { id: createSuspensionDto.userId },
      company: { id: createSuspensionDto.companyId },
      isActive: true
    });

    return await this.suspensionRepository.save(suspension);
  }

  async getSuspensions(userId: string, companyId: string): Promise<SubscriptionSuspension[]> {
    return await this.suspensionRepository.find({
      where: { 
        user: { id: userId },
        company: { id: companyId }
      },
      relations: ['user', 'company', 'subscription'],
      order: { startDate: 'DESC' }
    });
  }

  async getActiveSuspension(subscriptionId: string, date?: Date): Promise<SubscriptionSuspension | null> {
    const checkDate = date || new Date();
    
    return await this.suspensionRepository.findOne({
      where: {
        subscription: { id: subscriptionId },
        isActive: true,
      }
    });

    // Verificar si la fecha está dentro del rango de suspensión
    // (esto se puede hacer en la consulta, pero por ahora lo hacemos manualmente)
  }

  async updateSuspension(suspensionId: string, updateSuspensionDto: UpdateSuspensionDto): Promise<SubscriptionSuspension> {
    const suspension = await this.suspensionRepository.findOne({
      where: { id: suspensionId },
      relations: ['user', 'company']
    });

    if (!suspension) {
      throw new NotFoundException('Suspension not found');
    }

    // Actualizar campos si se proporcionan
    if (updateSuspensionDto.startDate !== undefined) {
      const startDate = this.parseDateWithoutTimeZone(updateSuspensionDto.startDate);
      suspension.startDate = startDate;
    }

    if (updateSuspensionDto.endDate !== undefined) {
      const endDate = this.parseDateWithoutTimeZone(updateSuspensionDto.endDate);
      suspension.endDate = endDate;
    }

    if (updateSuspensionDto.reason !== undefined) {
      suspension.reason = updateSuspensionDto.reason;
    }

    if (updateSuspensionDto.notes !== undefined) {
      suspension.notes = updateSuspensionDto.notes;
    }

    if (updateSuspensionDto.isActive !== undefined) {
      suspension.isActive = updateSuspensionDto.isActive;
    }

    // Validar fechas si ambas fueron actualizadas
    if (updateSuspensionDto.startDate !== undefined || updateSuspensionDto.endDate !== undefined) {
      if (suspension.startDate >= suspension.endDate) {
        throw new BadRequestException('End date must be after start date');
      }
    }

    return await this.suspensionRepository.save(suspension);
  }

  async deleteSuspension(suspensionId: string): Promise<{ message: string }> {
    const suspension = await this.suspensionRepository.findOne({
      where: { id: suspensionId }
    });

    if (!suspension) {
      throw new NotFoundException('Suspension not found');
    }

    await this.suspensionRepository.remove(suspension);

    return { message: 'Suspension deleted successfully' };
  }

  // Verificar si un pago está en un período de suspensión
  private async isPaymentInSuspension(payment: Payment): Promise<boolean> {
    if (!payment.dueDate || !payment.user || !payment.company) {
      return false;
    }

    const suspensions = await this.suspensionRepository.find({
      where: {
        user: { id: payment.user.id },
        company: { id: payment.company.id },
        isActive: true
      }
    });

    const paymentDate = new Date(payment.dueDate);
    
    return suspensions.some(suspension => {
      const startDate = new Date(suspension.startDate);
      const endDate = new Date(suspension.endDate);
      return paymentDate >= startDate && paymentDate <= endDate;
    });
  }
}
