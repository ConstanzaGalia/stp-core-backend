import { Injectable, BadRequestException, NotFoundException, Inject, forwardRef, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThanOrEqual } from 'typeorm';
import { Payment, PaymentStatus, PaymentMethod } from '../../entities/payment.entity';
import { PaymentPlan } from '../../entities/payment-plan.entity';
import { UserPaymentSubscription, SubscriptionStatus } from '../../entities/user-payment-subscription.entity';
import { ClassUsage, ClassUsageType } from '../../entities/class-usage.entity';
import { User } from '../../entities/user.entity';
import { Company } from '../../entities/company.entity';
import { SubscriptionSuspension } from '../../entities/subscription-suspension.entity';
import { Reservation } from '../../entities/reservation.entity';
import { TimeSlot } from '../../entities/timeSlot.entity';
import { AthleteSchedule, ScheduleStatus } from '../../entities/athlete-schedule.entity';
import { ScheduleConfig } from '../../entities/schedule-config.entity';
import { ScheduleException } from '../../entities/schedule-exception.entity';
import { TimeSlotGeneration } from '../../entities/time-slot-generation.entity';
import { WaitlistReservation } from '../../entities/waitlist-reservation.entity';
import { CreatePaymentPlanDto } from './dto/create-payment-plan.dto';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { CompletePaymentDto } from './dto/complete-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { CreateSuspensionDto } from './dto/create-suspension.dto';
import { UpdateSuspensionDto } from './dto/update-suspension.dto';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

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
    @InjectRepository(Reservation)
    private readonly reservationRepository: Repository<Reservation>,
    @InjectRepository(TimeSlot)
    private readonly timeSlotRepository: Repository<TimeSlot>,
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

    // Calcular el inicio de la semana actual (lunes)
    const weekStartDate = this.getWeekStartDate(startDate);

    const subscription = this.subscriptionRepository.create({
      ...createSubscriptionDto,
      startDate: periodStartDate,
      endDate: null, // No tiene fecha de fin (es recurrente)
      nextBillingDate,
      totalInstallments: 1,
      pendingInstallments: 1,
      classesUsedThisPeriod: 0,
      classesRemainingThisPeriod: paymentPlan.maxClassesPerPeriod,
      weekStartDate, // Inicio de la semana actual
      classesUsedThisWeek: 0, // Clases usadas esta semana
      classesRemainingThisWeek: paymentPlan.classesPerWeek, // Clases restantes esta semana
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

  // ===== HELPERS PARA LÓGICA SEMANAL =====
  /**
   * Calcula el inicio de la semana (lunes) para una fecha dada
   */
  private getWeekStartDate(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Ajustar para que lunes sea el primer día
    const monday = new Date(d.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
  }

  /**
   * Verifica si una fecha está en la misma semana que otra fecha
   */
  private isSameWeek(date1: Date, date2: Date): boolean {
    const weekStart1 = this.getWeekStartDate(date1);
    const weekStart2 = this.getWeekStartDate(date2);
    return weekStart1.getTime() === weekStart2.getTime();
  }

  /**
   * Renueva los contadores semanales si es necesario
   */
  private async renewWeeklyCounters(subscription: UserPaymentSubscription): Promise<UserPaymentSubscription> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Si no tiene weekStartDate o es una semana diferente, renovar
    if (!subscription.weekStartDate || !this.isSameWeek(today, subscription.weekStartDate)) {
      // Asegurarse de que paymentPlan esté cargado
      if (!subscription.paymentPlan) {
        const subscriptionWithPlan = await this.subscriptionRepository.findOne({
          where: { id: subscription.id },
          relations: ['paymentPlan']
        });
        if (!subscriptionWithPlan || !subscriptionWithPlan.paymentPlan) {
          return subscription;
        }
        subscription.paymentPlan = subscriptionWithPlan.paymentPlan;
      }

      const newWeekStart = this.getWeekStartDate(today);
      subscription.weekStartDate = newWeekStart;
      subscription.classesUsedThisWeek = 0;
      subscription.classesRemainingThisWeek = subscription.paymentPlan.classesPerWeek;
      await this.subscriptionRepository.save(subscription);
    }

    return subscription;
  }

  /**
   * Obtiene las clases vencidas (semanas pasadas sin usar)
   */
  private async getExpiredClasses(subscription: UserPaymentSubscription): Promise<any[]> {
    const expiredClasses = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const currentWeekStart = this.getWeekStartDate(today);

    // Asegurarse de que paymentPlan esté cargado
    if (!subscription.paymentPlan) {
      const subscriptionWithPlan = await this.subscriptionRepository.findOne({
        where: { id: subscription.id },
        relations: ['paymentPlan']
      });
      if (!subscriptionWithPlan || !subscriptionWithPlan.paymentPlan) {
        return [];
      }
      subscription.paymentPlan = subscriptionWithPlan.paymentPlan;
    }

    // Obtener todas las semanas desde el inicio del período hasta hoy
    const periodStart = new Date(subscription.periodStartDate);
    periodStart.setHours(0, 0, 0, 0);
    const periodStartWeek = this.getWeekStartDate(periodStart);

    // Iterar por cada semana desde el inicio del período hasta la semana pasada
    let weekStart = new Date(periodStartWeek);
    while (weekStart < currentWeekStart) {
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6); // Domingo de esa semana
      weekEnd.setHours(23, 59, 59, 999); // Incluir todo el día

      // Verificar si hay clases usadas en esa semana
      const classesInWeek = await this.classUsageRepository.find({
        where: {
          subscription: { id: subscription.id },
          usageDate: Between(weekStart, weekEnd)
        }
      });

      const classesUsed = classesInWeek.length;
      const classesAllowed = subscription.paymentPlan.classesPerWeek;
      const classesExpired = Math.max(0, classesAllowed - classesUsed);

      if (classesExpired > 0) {
        const weekEndDate = new Date(weekStart);
        weekEndDate.setDate(weekEndDate.getDate() + 6); // Domingo de esa semana
        expiredClasses.push({
          weekStart: weekStart.toISOString().split('T')[0],
          weekEnd: weekEndDate.toISOString().split('T')[0],
          classesAllowed,
          classesUsed,
          classesExpired
        });
      }

      // Avanzar a la siguiente semana
      weekStart.setDate(weekStart.getDate() + 7);
    }

    return expiredClasses;
  }

  // ===== GESTIÓN DE CLASES =====
  async canUserBookClass(subscriptionId: string, reservationDate?: Date): Promise<boolean> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { id: subscriptionId },
      relations: ['paymentPlan', 'payments']
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    // Verificar que la suscripción esté activa
    if (subscription.status !== SubscriptionStatus.ACTIVE) {
      return false;
    }

    // Si se proporciona una fecha de reserva, verificar que haya un pago pagado para ese período
    if (reservationDate) {
      const reservationDateOnly = new Date(reservationDate);
      reservationDateOnly.setHours(0, 0, 0, 0);

      // Buscar un pago pagado cuyo período incluya la fecha de la reserva
      const paidPayment = subscription.payments.find(payment => {
        if (payment.status !== PaymentStatus.PAID || !payment.paidDate) {
          return false;
        }

        // Obtener el período de la suscripción cuando se pagó este pago
        // El período es de 30 días desde el paidDate
        const paymentDate = new Date(payment.paidDate);
        paymentDate.setHours(0, 0, 0, 0);
        
        const periodStart = new Date(paymentDate);
        const periodEnd = new Date(paymentDate);
        periodEnd.setDate(periodEnd.getDate() + 30);

        // Verificar que la fecha de reserva esté dentro del período pagado
        return reservationDateOnly >= periodStart && reservationDateOnly <= periodEnd;
      });

      if (!paidPayment) {
        return false; // No hay pago pagado para este período
      }
    } else {
      // Si no se proporciona fecha, verificar que haya un pago pagado para el período actual
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const paidPayment = subscription.payments.find(payment => {
        if (payment.status !== PaymentStatus.PAID || !payment.paidDate) {
          return false;
        }

        const paymentDate = new Date(payment.paidDate);
        paymentDate.setHours(0, 0, 0, 0);
        
        const periodStart = new Date(paymentDate);
        const periodEnd = new Date(paymentDate);
        periodEnd.setDate(periodEnd.getDate() + 30);

        return today >= periodStart && today <= periodEnd;
      });

      if (!paidPayment) {
        return false; // No hay pago pagado para el período actual
      }
    }

    // Renovar contadores semanales si es necesario
    await this.renewWeeklyCounters(subscription);

    // Recargar la suscripción para obtener los valores actualizados
    const updatedSubscription = await this.subscriptionRepository.findOne({
      where: { id: subscriptionId },
      relations: ['paymentPlan']
    });

    // Verificar que tenga clases disponibles esta semana (lógica semanal)
    if (updatedSubscription.classesRemainingThisWeek <= 0) {
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

    const usageDate = usageData.usageDate ? new Date(usageData.usageDate) : new Date();
    usageDate.setHours(0, 0, 0, 0);

    // Verificar que pueda usar la clase en la fecha indicada
    if (!(await this.canUserBookClass(subscriptionId, usageDate))) {
      throw new BadRequestException('User cannot book class at this time');
    }

    // Renovar contadores semanales si es necesario
    await this.renewWeeklyCounters(subscription);

    // Recargar la suscripción para obtener los valores actualizados
    const updatedSubscription = await this.subscriptionRepository.findOne({
      where: { id: subscriptionId },
      relations: ['user', 'company', 'paymentPlan']
    });

    // Crear registro de uso de clase
    const classUsage = this.classUsageRepository.create({
      ...usageData,
      usageDate,
      user: { id: updatedSubscription.user.id },
      company: { id: updatedSubscription.company.id },
      subscription: { id: subscriptionId }
    });

    const savedClassUsage = await this.classUsageRepository.save(classUsage);

    // Actualizar contadores semanales (lógica semanal)
    updatedSubscription.classesUsedThisWeek += 1;
    updatedSubscription.classesRemainingThisWeek -= 1;
    
    // También actualizar contadores del período (para compatibilidad)
    updatedSubscription.classesUsedThisPeriod += 1;
    updatedSubscription.classesRemainingThisPeriod -= 1;
    
    await this.subscriptionRepository.save(updatedSubscription);

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

  /**
   * Reinicia los períodos y contadores mensuales de una suscripción
   */
  private async resetMonthlyPeriod(subscription: UserPaymentSubscription, newPaymentPlan?: PaymentPlan): Promise<UserPaymentSubscription> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Si se proporciona un nuevo plan, actualizarlo
    let paymentPlanToUse = subscription.paymentPlan;
    if (newPaymentPlan) {
      paymentPlanToUse = newPaymentPlan;
      // Actualizar la relación en la base de datos
      subscription.paymentPlan = newPaymentPlan;
    }

    // Asegurarse de que paymentPlan esté cargado
    if (!paymentPlanToUse) {
      const subscriptionWithPlan = await this.subscriptionRepository.findOne({
        where: { id: subscription.id },
        relations: ['paymentPlan']
      });
      if (subscriptionWithPlan && subscriptionWithPlan.paymentPlan) {
        paymentPlanToUse = subscriptionWithPlan.paymentPlan;
        subscription.paymentPlan = subscriptionWithPlan.paymentPlan;
      } else {
        throw new BadRequestException('Payment plan not found for subscription');
      }
    }

    // Calcular el inicio de semana (lunes) para usar como base del período
    // Si ya existe weekStartDate y no ha pasado una semana completa, mantenerlo
    // Si no existe o ya pasó una semana, calcular el nuevo lunes
    let newWeekStart: Date;
    if (subscription.weekStartDate) {
      const existingWeekStart = new Date(subscription.weekStartDate);
      existingWeekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(existingWeekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);
      
      // Si todavía estamos en la misma semana, mantener el weekStartDate existente
      if (today <= weekEnd) {
        newWeekStart = existingWeekStart;
      } else {
        // Si ya pasó la semana, calcular el nuevo lunes
        newWeekStart = this.getWeekStartDate(today);
      }
    } else {
      // Si no existe weekStartDate, calcular el lunes de la semana actual
      newWeekStart = this.getWeekStartDate(today);
    }
    
    // Usar weekStartDate como periodStartDate (no correr la fecha si el alumno se atrasó)
    const newPeriodStartDate = new Date(newWeekStart);
    const newPeriodEndDate = new Date(newPeriodStartDate);
    newPeriodEndDate.setDate(newPeriodEndDate.getDate() + 30);

    // Actualizar períodos
    subscription.periodStartDate = newPeriodStartDate;
    subscription.periodEndDate = newPeriodEndDate;
    subscription.nextBillingDate = newPeriodEndDate;

    // Reiniciar contadores mensuales
    subscription.classesUsedThisPeriod = 0;
    subscription.classesRemainingThisPeriod = paymentPlanToUse.maxClassesPerPeriod;

    // Actualizar contadores semanales
    subscription.weekStartDate = newWeekStart;
    subscription.classesUsedThisWeek = 0;
    subscription.classesRemainingThisWeek = paymentPlanToUse.classesPerWeek;

    return await this.subscriptionRepository.save(subscription);
  }

  /**
   * Verifica si una suscripción necesita reiniciar su período mensual
   */
  private needsMonthlyReset(subscription: UserPaymentSubscription): boolean {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const periodEnd = new Date(subscription.periodEndDate);
    periodEnd.setHours(0, 0, 0, 0);

    // Si el período ya terminó, necesita reiniciar
    return today > periodEnd;
  }

  // ===== PAGO COMPLETO (SUSCRIPCIÓN + PAGO) =====
  async completePayment(completePaymentDto: CompletePaymentDto): Promise<{ subscription: UserPaymentSubscription; payment: Payment }> {
    const { userId, paymentPlanId, companyId, amount, paymentMethod, discount, transactionId, notes, startDate } = completePaymentDto;

    // 1. Obtener el nuevo plan de pago
    const newPaymentPlan = await this.paymentPlanRepository.findOne({
      where: { id: paymentPlanId },
      relations: ['company']
    });

    if (!newPaymentPlan) {
      throw new NotFoundException('Payment plan not found');
    }

    // Verificar que el plan pertenece a la empresa
    if (newPaymentPlan.company.id !== companyId) {
      throw new BadRequestException('Payment plan does not belong to this company');
    }

    // 2. Buscar cualquier suscripción activa del usuario en esta empresa
    let existingSubscription = await this.subscriptionRepository.findOne({
      where: {
        user: { id: userId },
        company: { id: companyId },
        status: SubscriptionStatus.ACTIVE
      },
      relations: ['user', 'paymentPlan', 'company', 'payments']
    });

    let subscription: UserPaymentSubscription;
    let planChanged = false;
    let needsReset = false;

    if (existingSubscription) {
      // Verificar si el plan cambió
      planChanged = existingSubscription.paymentPlan.id !== paymentPlanId;

      // Verificar si necesita reiniciar el período mensual
      needsReset = this.needsMonthlyReset(existingSubscription);

      // Siempre reiniciar el período cuando se paga una nueva cuota mensual
      // Esto asegura que cada pago mensual reinicie los contadores
      subscription = await this.resetMonthlyPeriod(existingSubscription, planChanged ? newPaymentPlan : undefined);
    } else {
      // Si no existe suscripción activa, crear una nueva
      const createSubscriptionDto: CreateSubscriptionDto = {
        userId,
        paymentPlanId,
        startDate: startDate || new Date().toISOString().split('T')[0],
        autoRenew: true
      };

      subscription = await this.createSubscription(companyId, createSubscriptionDto);
    }

    // 3. Recargar la suscripción para obtener los valores actualizados después del reinicio
    subscription = await this.subscriptionRepository.findOne({
      where: { id: subscription.id },
      relations: ['user', 'paymentPlan', 'company']
    });

    // 4. Si existe una suscripción activa, siempre generar un nuevo pago mensual
    // Esto asegura que cada pago mensual tenga su propio pago asociado
    if (existingSubscription) {
      // Generar nuevo pago mensual para el nuevo período
      await this.generateMonthlyPayment(subscription);
    }

    // 5. Buscar el pago pendiente (puede ser el recién generado o uno existente)
    let pendingPayments = await this.paymentRepository.find({
      where: {
        subscription: { id: subscription.id },
        status: PaymentStatus.PENDING
      },
      order: { dueDate: 'DESC' } // Obtener el más reciente por fecha de vencimiento
    });

    let pendingPayment = pendingPayments.length > 0 ? pendingPayments[0] : null;

    // Si no se encuentra, esperar un poco y reintentar (para suscripciones nuevas)
    if (!pendingPayment) {
      await new Promise(resolve => setTimeout(resolve, 100));
      
      pendingPayments = await this.paymentRepository.find({
        where: {
          subscription: { id: subscription.id },
          status: PaymentStatus.PENDING
        },
        order: { dueDate: 'DESC' }
      });

      pendingPayment = pendingPayments.length > 0 ? pendingPayments[0] : null;
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

    // Generar reservas automáticamente basadas en reservas recurrentes activas
    // Implementar la lógica directamente aquí para evitar dependencia circular
    try {
      this.logger.log(`completePayment -> starting reservation generation for userId=${userId}, companyId=${companyId}, subscriptionId=${subscription.id}`);
      
      // Obtener repositorio de reservas recurrentes usando el manager de la suscripción
      const athleteScheduleRepository = this.subscriptionRepository.manager.getRepository(AthleteSchedule);
      const reservationRepository = this.subscriptionRepository.manager.getRepository(Reservation);

      // Buscar todas las reservas recurrentes activas del usuario para esa empresa
      const activeAthleteSchedules = await athleteScheduleRepository.find({
        where: {
          user: { id: userId },
          company: { id: companyId },
          status: ScheduleStatus.ACTIVE
        },
        relations: ['user', 'company']
      });

      this.logger.log(`completePayment -> found ${activeAthleteSchedules.length} active athlete schedules for user=${userId}`);

      if (activeAthleteSchedules.length === 0) {
        this.logger.log(`completePayment -> no active recurring reservations for user=${userId}, companyId=${companyId}`);
        return {
          subscription,
          payment
        };
      }

      // Obtener todos los repositorios necesarios usando el manager
      const timeSlotRepository = this.subscriptionRepository.manager.getRepository(TimeSlot);
      const classUsageRepository = this.subscriptionRepository.manager.getRepository(ClassUsage);
      const scheduleConfigRepository = this.subscriptionRepository.manager.getRepository(ScheduleConfig);
      const scheduleExceptionRepository = this.subscriptionRepository.manager.getRepository(ScheduleException);
      const timeSlotGenerationRepository = this.subscriptionRepository.manager.getRepository(TimeSlotGeneration);
      const waitlistRepository = this.subscriptionRepository.manager.getRepository(WaitlistReservation);
      
      // Obtener AvailableClass y su repositorio
      const { AvailableClass } = await import('../../entities/available-class.entity');
      const availableClassRepository = this.subscriptionRepository.manager.getRepository(AvailableClass);
      
      // Obtener ReservationsService usando import dinámico
      const { ReservationsService } = await import('../reservation/reservation.service');
      
      // Crear instancia del servicio con todas las dependencias necesarias
      const reservationsService = new ReservationsService(
        reservationRepository,
        timeSlotRepository,
        this.companyRepository,
        scheduleConfigRepository,
        scheduleExceptionRepository,
        timeSlotGenerationRepository,
        athleteScheduleRepository,
        this.subscriptionRepository,
        classUsageRepository,
        this.paymentRepository,
        waitlistRepository,
        availableClassRepository,
        this // paymentsService - pasar this como referencia
      );
      
      this.logger.log(`completePayment -> calling generateReservationsFromRecurringOnPayment for ${activeAthleteSchedules.length} athlete schedules`);
      
      // Usar periodStartDate de la suscripción como inicio (no la fecha de pago)
      // Esto asegura que si el alumno se atrasó en pagar, su fecha de inicio no se corra
      const periodStartDate = new Date(subscription.periodStartDate);
      periodStartDate.setHours(0, 0, 0, 0);
      const periodEndDate = new Date(subscription.periodEndDate);
      periodEndDate.setHours(23, 59, 59, 999);
      
      this.logger.log(`completePayment -> periodStartDate=${periodStartDate.toISOString()}, periodEndDate=${periodEndDate.toISOString()}`);
      
      const result = await reservationsService.generateReservationsFromRecurringOnPayment(
        userId,
        companyId,
        subscription.id,
        periodStartDate,
        periodEndDate,
        payment.id
      );
      
      this.logger.log(`completePayment -> reservations generated: ${result.createdReservations} created, ${result.skippedDates.length} skipped, ${result.errors.length} errors for subscription=${subscription.id}`);
      
      if (result.errors.length > 0) {
        this.logger.warn(`completePayment -> errors during reservation generation: ${result.errors.join('; ')}`);
      }
    } catch (error) {
      // No fallar el pago si hay error en generación de reservas (solo loggear)
      this.logger.error(`completePayment -> error generating reservations: ${error?.message}`, error?.stack);
      this.logger.error(`completePayment -> error stack: ${error?.stack}`);
    }

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

  async deletePayment(paymentId: string): Promise<{ message: string; cancelledReservations?: number; subscriptionCancelled?: boolean }> {
    // Validar que paymentId sea un UUID válido
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(paymentId)) {
      throw new BadRequestException('Invalid payment ID format');
    }

    // Obtener el payment con solo los campos necesarios usando query builder
    const payment = await this.paymentRepository
      .createQueryBuilder('payment')
      .select(['payment.id', 'payment.status', 'payment.paidDate', 'payment.subscriptionId'])
      .where('payment.id = :id', { id: paymentId })
      .getOne();

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    // Obtener subscriptionId directamente del campo subscriptionId
    const subscriptionId = (payment as any).subscriptionId;
    let cancelledReservationsCount = 0;
    let subscriptionCancelled = false;

    // Si el pago está pagado, cancelar todas las reservas del período correspondiente
    if (payment.status === PaymentStatus.PAID && payment.paidDate && subscriptionId && uuidRegex.test(subscriptionId)) {
      // Recargar la suscripción con todas las relaciones necesarias
      const subscription = await this.subscriptionRepository.findOne({
        where: { id: subscriptionId },
        relations: ['user', 'company']
      });

      if (!subscription || !subscription.user || !subscription.user.id) {
        throw new BadRequestException('Subscription or user not found');
      }
      
      // Calcular el período del pago (30 días desde paidDate)
      const paymentDate = new Date(payment.paidDate);
      paymentDate.setHours(0, 0, 0, 0);
      
      const periodStart = new Date(paymentDate);
      const periodEnd = new Date(paymentDate);
      periodEnd.setDate(periodEnd.getDate() + 30);
      periodEnd.setHours(23, 59, 59, 999);

      // Buscar todas las reservas del usuario en este período
      const reservations = await this.reservationRepository.find({
        where: {
          user: { id: subscription.user.id },
        },
        relations: ['timeSlot', 'user']
      });

      // Filtrar reservas que estén dentro del período del pago eliminado
      const reservationsInPeriod = reservations.filter(reservation => {
        const reservationDate = new Date(reservation.timeSlot.date);
        reservationDate.setHours(0, 0, 0, 0);
        return reservationDate >= periodStart && reservationDate <= periodEnd;
      });

      // Eliminar las reservas y actualizar contadores de timeSlots
      for (const reservation of reservationsInPeriod) {
        // Decrementar contador del timeSlot
        const timeSlot = await this.timeSlotRepository.findOne({
          where: { id: reservation.timeSlot.id }
        });
        
        if (timeSlot) {
          timeSlot.reservedCount = Math.max(0, timeSlot.reservedCount - 1);
          await this.timeSlotRepository.save(timeSlot);
        }

        // Eliminar la reserva
        await this.reservationRepository.remove(reservation);
        cancelledReservationsCount++;
      }
    }

    // Si la suscripción existe, verificar si tiene otros pagos pagados ANTES de eliminar
    if (subscriptionId && uuidRegex.test(subscriptionId)) {
      // Buscar otros pagos pagados de esta suscripción (excluyendo el que vamos a eliminar)
      const otherPaidPayments = await this.paymentRepository.find({
        where: {
          subscription: { id: subscriptionId },
          status: PaymentStatus.PAID
        }
      });

      // Filtrar el payment que vamos a eliminar
      const hasOtherPaidPayments = otherPaidPayments.some(
        p => p.id !== paymentId
      );

      // Si no hay otros pagos pagados, cancelar la suscripción
      if (!hasOtherPaidPayments) {
        const subscription = await this.subscriptionRepository.findOne({
          where: { id: subscriptionId }
        });

        if (subscription) {
          subscription.status = SubscriptionStatus.CANCELLED;
          await this.subscriptionRepository.save(subscription);
          subscriptionCancelled = true;
        }
      }
    }

    // Eliminar el pago usando el ID
    await this.paymentRepository.delete(paymentId);

    return { 
      message: 'Payment deleted successfully',
      cancelledReservations: cancelledReservationsCount,
      subscriptionCancelled: subscriptionCancelled
    };
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

  // ===== OBTENER PLAN Y PAGOS DEL ALUMNO =====
  async getStudentPlanAndPayments(userId: string, companyId: string): Promise<any> {
    // Obtener la suscripción activa del alumno en el centro
    const subscription = await this.subscriptionRepository.findOne({
      where: {
        user: { id: userId },
        company: { id: companyId },
        status: SubscriptionStatus.ACTIVE
      },
      relations: ['user', 'paymentPlan', 'company', 'payments']
    });

    // Si no hay suscripción activa, devolver objeto vacío
    if (!subscription) {
      return {
        subscription: null,
        plan: null,
        payments: [],
        pendingPayment: null,
        suspensions: [],
        expiredClasses: [],
        statistics: {
          totalPayments: 0,
          paidPayments: 0,
          pendingPayments: 0,
          overduePayments: 0,
          totalExpiredClasses: 0
        },
        hasActiveSubscription: false
      };
    }

    // Renovar contadores semanales si es necesario
    await this.renewWeeklyCounters(subscription);

    // Recargar la suscripción para obtener los valores actualizados
    const updatedSubscription = await this.subscriptionRepository.findOne({
      where: {
        user: { id: userId },
        company: { id: companyId },
        status: SubscriptionStatus.ACTIVE
      },
      relations: ['user', 'paymentPlan', 'company', 'payments']
    });

    // Obtener clases vencidas
    const expiredClasses = await this.getExpiredClasses(updatedSubscription);

    // Obtener todos los pagos ordenados del más reciente al más antiguo
    const allPayments = updatedSubscription.payments
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
        const dateA = a.sortDate ? new Date(a.sortDate).getTime() : 0;
        const dateB = b.sortDate ? new Date(b.sortDate).getTime() : 0;
        return dateB - dateA; // Más reciente primero
      });

    // Obtener suspensiones activas del alumno
    const activeSuspensions = await this.suspensionRepository.find({
      where: {
        user: { id: userId },
        company: { id: companyId },
        isActive: true
      },
      order: { startDate: 'DESC' }
    });

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
        ...payment,
        isOverdue: payment.dueDate ? new Date(payment.dueDate) < new Date() && payment.status === PaymentStatus.PENDING : false,
        isSuspended: isSuspended
      };
    });

    // Obtener el pago pendiente actual
    const pendingPayment = updatedSubscription.payments.find(p => p.status === PaymentStatus.PENDING);

    // Calcular el fin de la semana actual
    const currentWeekEnd = new Date(updatedSubscription.weekStartDate);
    currentWeekEnd.setDate(currentWeekEnd.getDate() + 6);

    return {
      // Información de la suscripción
      subscription: {
        id: updatedSubscription.id,
        status: updatedSubscription.status,
        periodStartDate: updatedSubscription.periodStartDate,
        periodEndDate: updatedSubscription.periodEndDate,
        nextBillingDate: updatedSubscription.nextBillingDate,
        classesUsedThisPeriod: updatedSubscription.classesUsedThisPeriod,
        classesRemainingThisPeriod: updatedSubscription.classesRemainingThisPeriod,
        autoRenew: updatedSubscription.autoRenew,
        // Información semanal
        weekStartDate: updatedSubscription.weekStartDate,
        weekEndDate: currentWeekEnd.toISOString().split('T')[0],
        classesUsedThisWeek: updatedSubscription.classesUsedThisWeek,
        classesRemainingThisWeek: updatedSubscription.classesRemainingThisWeek,
        classesAllowedPerWeek: updatedSubscription.paymentPlan.classesPerWeek
      },
      // Información del plan
      plan: {
        id: updatedSubscription.paymentPlan.id,
        name: updatedSubscription.paymentPlan.name,
        description: updatedSubscription.paymentPlan.description,
        amount: updatedSubscription.paymentPlan.amount,
        classesPerWeek: updatedSubscription.paymentPlan.classesPerWeek,
        maxClassesPerPeriod: updatedSubscription.paymentPlan.maxClassesPerPeriod,
        frequencyDays: updatedSubscription.paymentPlan.frequencyDays,
        gracePeriodDays: updatedSubscription.paymentPlan.gracePeriodDays,
        lateFeePercentage: updatedSubscription.paymentPlan.lateFeePercentage,
        allowClassRollover: updatedSubscription.paymentPlan.allowClassRollover,
        maxRolloverClasses: updatedSubscription.paymentPlan.maxRolloverClasses
      },
      // Todos los pagos
      payments: paymentsWithSuspension,
      // Pago pendiente (si existe)
      pendingPayment: pendingPayment ? {
        id: pendingPayment.id,
        amount: pendingPayment.amount,
        totalAmount: pendingPayment.totalAmount,
        dueDate: pendingPayment.dueDate,
        lateFee: pendingPayment.lateFee,
        discount: pendingPayment.discount,
        isOverdue: pendingPayment.dueDate ? new Date(pendingPayment.dueDate) < new Date() : false,
        isSuspended: paymentsWithSuspension.find(p => p.id === pendingPayment.id)?.isSuspended || false
      } : null,
      // Suspensiones activas
      suspensions: activeSuspensions.map(suspension => ({
        id: suspension.id,
        startDate: suspension.startDate,
        endDate: suspension.endDate,
        reason: suspension.reason,
        notes: suspension.notes,
        isActive: suspension.isActive
      })),
      // Clases vencidas (semanas pasadas sin usar)
      expiredClasses: expiredClasses,
      // Estadísticas
      statistics: {
        totalPayments: updatedSubscription.payments.length,
        paidPayments: updatedSubscription.payments.filter(p => p.status === PaymentStatus.PAID).length,
        pendingPayments: updatedSubscription.payments.filter(p => p.status === PaymentStatus.PENDING).length,
        overduePayments: updatedSubscription.payments.filter(p => 
          p.status === PaymentStatus.PENDING && p.dueDate && new Date(p.dueDate) < new Date()
        ).length,
        totalExpiredClasses: expiredClasses.reduce((sum, week) => sum + week.classesExpired, 0)
      },
      hasActiveSubscription: true
    };
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
