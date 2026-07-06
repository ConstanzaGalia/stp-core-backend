import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DivisionsController } from './divisions.controller';
import { DivisionsService } from './divisions.service';
import { DivisionAnalyticsService } from './division-analytics.service';
import { Division } from '../../entities/division.entity';
import { Company } from '../../entities/company.entity';
import { User } from '../../entities/user.entity';
import { AthleteInvitation } from '../../entities/athlete-invitation.entity';
import { PhysicalEvaluation } from '../../entities/physical-evaluation.entity';
import { STPSessionInstance } from '../../entities/stp-session-instance.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Division,
      Company,
      User,
      AthleteInvitation,
      PhysicalEvaluation,
      STPSessionInstance,
    ]),
    AuthModule,
  ],
  controllers: [DivisionsController],
  providers: [DivisionsService, DivisionAnalyticsService],
  exports: [DivisionsService, DivisionAnalyticsService],
})
export class DivisionsModule {}
