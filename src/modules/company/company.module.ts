import { Module } from '@nestjs/common';
import { CompanyService } from './company.service';
import { CompanyController } from './company.controller';
import { Pagination } from 'src/common/pagination/pagination';
import { Company } from 'src/entities/company.entity';
import { User } from 'src/entities/user.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([Company, User]), AuthModule],
  controllers: [CompanyController],
  providers: [CompanyService, Pagination, ],
})
export class CompanyModule {}
