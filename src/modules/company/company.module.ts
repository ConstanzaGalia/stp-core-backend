import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CompanyService } from './company.service';
import { CompanyController } from './company.controller';
import { Pagination } from 'src/common/pagination/pagination';
import { Company } from 'src/entities/company.entity';
import { User } from 'src/entities/user.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { MailingModule } from '../mailer/mailing.module';
import { EncryptService } from 'src/services/bcrypt.service';
import { CompanySubscriptionGuard } from 'src/common/guards/company-subscription.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([Company, User]), 
    AuthModule,
    MailingModule
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
  exports: [CompanyService]
})
export class CompanyModule {}
