import { Module, forwardRef } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CompanyService } from './company.service';
import { CompanyController } from './company.controller';
import { Pagination } from 'src/common/pagination/pagination';
import { Company } from 'src/entities/company.entity';
import { CompanyStaffMembership } from 'src/entities/company-staff-membership.entity';
import { StaffAssociationRequest } from 'src/entities/staff-association-request.entity';
import { StaffShiftAssignment } from 'src/entities/staff-shift-assignment.entity';
import { STPSessionInstance } from 'src/entities/stp-session-instance.entity';
import { User } from 'src/entities/user.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { MailingModule } from '../mailer/mailing.module';
import { EncryptService } from 'src/services/bcrypt.service';
import { CompanySubscriptionGuard } from 'src/common/guards/company-subscription.guard';
import { StpPlatformBillingModule } from '../stp-platform-billing/stp-platform-billing.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Company,
      User,
      StaffAssociationRequest,
      CompanyStaffMembership,
      StaffShiftAssignment,
      STPSessionInstance,
    ]),
    AuthModule,
    MailingModule,
    forwardRef(() => StpPlatformBillingModule),
  ],
  controllers: [CompanyController],
  providers: [
    CompanyService,
    Pagination,
    EncryptService,
    CompanySubscriptionGuard,
    {
      provide: APP_GUARD,
      useClass: CompanySubscriptionGuard,
    },
  ],
  exports: [CompanyService],
})
export class CompanyModule {}
