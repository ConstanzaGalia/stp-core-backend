import { Module } from '@nestjs/common';
import { CompanyService } from './company.service';
import { CompanyController } from './company.controller';
import { Pagination } from 'src/common/pagination/pagination';
import { Company } from 'src/entities/company.entity';
import { User } from 'src/entities/user.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { MailingModule } from '../mailer/mailing.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Company, User]), 
    AuthModule,
    MailingModule
  ],
  controllers: [CompanyController],
  providers: [CompanyService, Pagination],
  exports: [CompanyService]
})
export class CompanyModule {}
