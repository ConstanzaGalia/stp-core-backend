import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThanOrEqual } from 'typeorm';
import { Payment, PaymentStatus, PaymentMethod } from '../../entities/payment.entity';
import { PaymentPlan } from '../../entities/payment-plan.entity';
import { UserPaymentSubscription, SubscriptionStatus } from '../../entities/user-payment-subscription.entity';
import { ClassUsage, ClassUsageType } from '../../entities/class-usage.entity';
import { User } from '../../entities/user.entity';
import { Company } from '../../entities/company.entity';
import { CreatePaymentPlanDto } from './dto/create-payment-plan.dto';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { ProcessPaymentDto } from './dto/process-payment.dto';

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
      this.paymentPlanRepository.findOne({ where: { id: createSubscriptionDto.paymentPlanId } }),
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

    // Generar la primera cuota mensual
    await this.generateMonthlyPayment(savedSubscription);

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

  // ===== PROCESAMIENTO DE PAGOS =====
  async processPayment(processPaymentDto: ProcessPaymentDto): Promise<Payment> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { id: processPaymentDto.subscriptionId },
      relations: ['paymentPlan', 'user', 'company']
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    // Buscar la cuota pendiente
    const pendingPayment = await this.paymentRepository.findOne({
      where: {
        subscription: { id: processPaymentDto.subscriptionId },
        status: PaymentStatus.PENDING
      }
    });

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
    pendingPayment.paymentMethod = processPaymentDto.paymentMethod;
    pendingPayment.paidDate = new Date();
    pendingPayment.lateFee = lateFee;
    pendingPayment.discount = processPaymentDto.discount || 0;
    pendingPayment.totalAmount = pendingPayment.amount + lateFee - (processPaymentDto.discount || 0);
    pendingPayment.transactionId = processPaymentDto.transactionId;
    pendingPayment.notes = processPaymentDto.notes;

    const savedPayment = await this.paymentRepository.save(pendingPayment);

    // Marcar cuota como pagada
    subscription.paidInstallments = 1;
    subscription.pendingInstallments = 0;
    await this.subscriptionRepository.save(subscription);

    return savedPayment;
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
}
