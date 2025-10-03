import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { Payment } from '../../entities/payment.entity';
import { PaymentPlan } from '../../entities/payment-plan.entity';
import { UserPaymentSubscription } from '../../entities/user-payment-subscription.entity';
import { ClassUsage } from '../../entities/class-usage.entity';
import { User } from '../../entities/user.entity';
import { Company } from '../../entities/company.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Payment,
      PaymentPlan,
      UserPaymentSubscription,
      ClassUsage,
      User,
      Company
    ])
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService]
})
export class PaymentsModule {}

