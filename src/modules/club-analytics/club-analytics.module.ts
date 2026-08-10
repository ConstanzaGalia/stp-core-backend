import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClubAnalyticsController } from './club-analytics.controller';
import { ClubAnalyticsService } from './club-analytics.service';
import { ClubAnalyticsTrainer } from '../../entities/club-analytics-trainer.entity';
import { Company } from '../../entities/company.entity';
import { User } from '../../entities/user.entity';
import { AuthModule } from '../auth/auth.module';
import { MailingModule } from '../mailer/mailing.module';
import { DivisionsModule } from '../divisions/divisions.module';
import { EncryptService } from '../../services/bcrypt.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ClubAnalyticsTrainer, Company, User]),
    AuthModule,
    MailingModule,
    DivisionsModule,
  ],
  controllers: [ClubAnalyticsController],
  providers: [ClubAnalyticsService, EncryptService],
  exports: [ClubAnalyticsService],
})
export class ClubAnalyticsModule {}
