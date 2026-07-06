import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SportPositionsController } from './sport-positions.controller';
import { SportPositionsService } from './sport-positions.service';
import { SportPosition } from '../../entities/sport-position.entity';
import { Company } from '../../entities/company.entity';
import { AthleteInvitation } from '../../entities/athlete-invitation.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SportPosition, Company, AthleteInvitation]),
    AuthModule,
  ],
  controllers: [SportPositionsController],
  providers: [SportPositionsService],
  exports: [SportPositionsService],
})
export class SportPositionsModule {}
