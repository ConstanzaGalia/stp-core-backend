import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { Payment } from '../../entities/payment.entity';
import { PaymentPlan } from '../../entities/payment-plan.entity';
import { UserPaymentSubscription } from '../../entities/user-payment-subscription.entity';
import { ClassUsage } from '../../entities/class-usage.entity';
import { User } from '../../entities/user.entity';
import { Company } from '../../entities/company.entity';
import { SubscriptionSuspension } from '../../entities/subscription-suspension.entity';
import { Expense } from '../../entities/expense.entity';
import { Reservation } from '../../entities/reservation.entity';
import { TimeSlot } from '../../entities/timeSlot.entity';
import { ReservationsModule } from '../reservation/reservation.module';
import { MailingModule } from '../mailer/mailing.module';
import { CompanyModule } from '../company/company.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Payment,
      PaymentPlan,
      UserPaymentSubscription,
      ClassUsage,
      User,
      Company,
      SubscriptionSuspension,
      Expense,
      Reservation,
      TimeSlot
    ]),
    forwardRef(() => ReservationsModule),
    MailingModule,
    CompanyModule
  ],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    {
      provide: 'PAYMENTS_SERVICE',
      useExisting: PaymentsService
    }
  ],
  exports: [PaymentsService]
})
export class PaymentsModule {}

