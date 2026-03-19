/**
 * Lista explícita de entidades para TypeORM.
 * Evita depender del glob en app.module (p. ej. "No metadata for User/Company was found"
 * si el patrón no resuelve igual en watch/dist).
 */
import { AthleteInvitation } from './entities/athlete-invitation.entity';
import { AthleteSchedule } from './entities/athlete-schedule.entity';
import { AvailableClass } from './entities/available-class.entity';
import { Category } from './entities/category.entity';
import { ClassUsage } from './entities/class-usage.entity';
import { Company } from './entities/company.entity';
import { Exercise } from './entities/excercise.entity';
import { Expense } from './entities/expense.entity';
import { ExtraIncome } from './entities/extra-income.entity';
import { Payment } from './entities/payment.entity';
import { PaymentPlan } from './entities/payment-plan.entity';
import { Plan } from './entities/plan.entity';
import { Product } from './entities/product.entity';
import { Reservation } from './entities/reservation.entity';
import { Sale } from './entities/sale.entity';
import { ScheduleConfig } from './entities/schedule-config.entity';
import { ScheduleException } from './entities/schedule-exception.entity';
import { Slot } from './entities/slot.entity';
import { SubscriptionSuspension } from './entities/subscription-suspension.entity';
import { Tag } from './entities/tag.entity';
import { TimeSlot } from './entities/timeSlot.entity';
import { TimeSlotGeneration } from './entities/time-slot-generation.entity';
import { TrainingPlan } from './entities/traininPlan.entity';
import { User } from './entities/user.entity';
import { UserPaymentSubscription } from './entities/user-payment-subscription.entity';
import { UserPlan } from './entities/userPlan.entity';
import { WaitlistReservation } from './entities/waitlist-reservation.entity';

export const TYPEORM_ENTITIES = [
  AthleteInvitation,
  AthleteSchedule,
  AvailableClass,
  Category,
  ClassUsage,
  Company,
  Exercise,
  Expense,
  ExtraIncome,
  Payment,
  PaymentPlan,
  Plan,
  Product,
  Reservation,
  Sale,
  ScheduleConfig,
  ScheduleException,
  Slot,
  SubscriptionSuspension,
  Tag,
  TimeSlot,
  TimeSlotGeneration,
  TrainingPlan,
  User,
  UserPaymentSubscription,
  UserPlan,
  WaitlistReservation,
];
