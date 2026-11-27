import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from 'src/entities/company.entity';
import { DemoLead } from 'src/entities/demo-lead.entity';
import { StpPlatformCharge } from 'src/entities/stp-platform-charge.entity';
import { StpPlatformSubscription } from 'src/entities/stp-platform-subscription.entity';
import { MailingModule } from '../mailer/mailing.module';
import { StpPlatformBillingController } from './stp-platform-billing.controller';
import { StpPlatformSubscriptionReadController } from './stp-platform-subscription-read.controller';
import { PlatformPlansPublicController } from './platform-plans-public.controller';
import { StpPlatformBillingService } from './stp-platform-billing.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StpPlatformSubscription,
      StpPlatformCharge,
      Company,
      DemoLead,
    ]),
    MailingModule,
  ],
  controllers: [
    StpPlatformBillingController,
    StpPlatformSubscriptionReadController,
    PlatformPlansPublicController,
  ],
  providers: [StpPlatformBillingService],
  exports: [StpPlatformBillingService],
})
export class StpPlatformBillingModule {}
