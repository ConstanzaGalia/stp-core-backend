import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from 'src/entities/company.entity';
import { StpPlatformCharge } from 'src/entities/stp-platform-charge.entity';
import { StpPlatformSubscription } from 'src/entities/stp-platform-subscription.entity';
import { StpPlatformBillingController } from './stp-platform-billing.controller';
import { StpPlatformBillingService } from './stp-platform-billing.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StpPlatformSubscription,
      StpPlatformCharge,
      Company,
    ]),
  ],
  controllers: [StpPlatformBillingController],
  providers: [StpPlatformBillingService],
  exports: [StpPlatformBillingService],
})
export class StpPlatformBillingModule {}
