/**
 * Lista explícita de entidades para TypeORM.
 * Evita depender del glob en app.module (p. ej. "No metadata for User/Company was found"
 * si el patrón no resuelve igual en watch/dist).
 */
import { AthleteInvitation } from './entities/athlete-invitation.entity';
import { Division } from './entities/division.entity';
import { SportPosition } from './entities/sport-position.entity';
import { ClubAnalyticsTrainer } from './entities/club-analytics-trainer.entity';
import { AthleteSchedule } from './entities/athlete-schedule.entity';
import { AvailableClass } from './entities/available-class.entity';
import { Category } from './entities/category.entity';
import { ClassUsage } from './entities/class-usage.entity';
import { Company } from './entities/company.entity';
import { AthleteEvaluation } from './entities/athlete-evaluation.entity';
import { PhysicalEvaluation } from './entities/physical-evaluation.entity';
import { PhysicalEvaluationTest } from './entities/physical-evaluation-test.entity';
import { PhysicalEvaluationMeasurement } from './entities/physical-evaluation-measurement.entity';
import { EvaluationProtocol } from './entities/evaluation-protocol.entity';
import { EvaluationCriteriaSet } from './entities/evaluation-criteria-set.entity';
import { BiomechanicalScreeningProtocol } from './entities/biomechanical-screening-protocol.entity';
import { BiomechanicalScreeningSession } from './entities/biomechanical-screening-session.entity';
import { BiomechanicalScreeningTestResult } from './entities/biomechanical-screening-test-result.entity';
import { Exercise } from './entities/excercise.entity';
import { Expense } from './entities/expense.entity';
import { FixedExpenseTemplate } from './entities/fixed-expense-template.entity';
import { FixedExpenseMonthStatus } from './entities/fixed-expense-month-status.entity';
import { Injury } from './entities/injury.entity';
import { AthleteObjective } from './entities/athlete-objective.entity';
import { Competition } from './entities/competition.entity';
import { CompetitionDivision } from './entities/competition-division.entity';
import { CompetitionParticipant } from './entities/competition-participant.entity';
import { CompetitionParticipantMatch } from './entities/competition-participant-match.entity';
import { CompetitionMatch } from './entities/competition-match.entity';
import { MovementPattern } from './entities/movement-pattern.entity';
import { SafetyTag } from './entities/safety-tag.entity';
import { ExtraIncome } from './entities/extra-income.entity';
import { Payment } from './entities/payment.entity';
import { PaymentPlan } from './entities/payment-plan.entity';
import { Plan } from './entities/plan.entity';
import { Product } from './entities/product.entity';
import { Reservation } from './entities/reservation.entity';
import { Sale } from './entities/sale.entity';
import { ScheduleConfig } from './entities/schedule-config.entity';
import { ScheduleException } from './entities/schedule-exception.entity';
import { StaffAssociationRequest } from './entities/staff-association-request.entity';
import { StaffCompensationProfile } from './entities/staff-compensation-profile.entity';
import { StaffCompensationPeriodRate } from './entities/staff-compensation-period-rate.entity';
import { StaffShiftAssignment } from './entities/staff-shift-assignment.entity';
import { StaffShiftClosure } from './entities/staff-shift-closure.entity';
import { StaffWeekNote } from './entities/staff-week-note.entity';
import { Slot } from './entities/slot.entity';
import { SubscriptionSuspension } from './entities/subscription-suspension.entity';
import { Tag } from './entities/tag.entity';
import { TimeSlot } from './entities/timeSlot.entity';
import { TimeSlotGeneration } from './entities/time-slot-generation.entity';
import { TrainingPlan } from './entities/traininPlan.entity';
import { STPTrainingProfile } from './entities/stp-training-profile.entity';
import { STPMacroPlan } from './entities/stp-macro-plan.entity';
import { STPWeeklyTemplate } from './entities/stp-weekly-template.entity';
import { STPSessionInstance } from './entities/stp-session-instance.entity';
import { User } from './entities/user.entity';
import { UserPaymentSubscription } from './entities/user-payment-subscription.entity';
import { UserPlan } from './entities/userPlan.entity';
import { WaitlistReservation } from './entities/waitlist-reservation.entity';

export const TYPEORM_ENTITIES = [
  AthleteEvaluation,
  PhysicalEvaluation,
  PhysicalEvaluationTest,
  PhysicalEvaluationMeasurement,
  EvaluationProtocol,
  EvaluationCriteriaSet,
  BiomechanicalScreeningProtocol,
  BiomechanicalScreeningSession,
  BiomechanicalScreeningTestResult,
  AthleteInvitation,
  AthleteSchedule,
  Division,
  SportPosition,
  ClubAnalyticsTrainer,
  AvailableClass,
  Category,
  ClassUsage,
  Company,
  Exercise,
  Expense,
  FixedExpenseTemplate,
  FixedExpenseMonthStatus,
  Injury,
  AthleteObjective,
  Competition,
  CompetitionDivision,
  CompetitionParticipant,
  CompetitionParticipantMatch,
  CompetitionMatch,
  MovementPattern,
  SafetyTag,
  ExtraIncome,
  Payment,
  PaymentPlan,
  Plan,
  Product,
  Reservation,
  Sale,
  ScheduleConfig,
  ScheduleException,
  StaffAssociationRequest,
  StaffCompensationProfile,
  StaffCompensationPeriodRate,
  StaffShiftAssignment,
  StaffShiftClosure,
  StaffWeekNote,
  Slot,
  SubscriptionSuspension,
  Tag,
  TimeSlot,
  TimeSlotGeneration,
  TrainingPlan,
  STPTrainingProfile,
  STPMacroPlan,
  STPWeeklyTemplate,
  STPSessionInstance,
  User,
  UserPaymentSubscription,
  UserPlan,
  WaitlistReservation,
];
