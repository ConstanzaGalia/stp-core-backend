import { Module } from '@nestjs/common';
import { CompanyService } from './company.service';
import { CompanyController } from './company.controller';
import { Pagination } from 'src/common/pagination/pagination';
import { Company } from 'src/entities/company.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([Company]), AuthModule],
  controllers: [CompanyController],
  providers: [CompanyService, Pagination, ],
})
export class CompanyModule {}
