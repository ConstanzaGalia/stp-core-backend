import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from 'src/entities/company.entity';
import { User } from 'src/entities/user.entity';
import { AthleteInvitation } from 'src/entities/athlete-invitation.entity';
import { AthleteSchedule } from 'src/entities/athlete-schedule.entity';
import { Division } from 'src/entities/division.entity';
import { SportPosition } from 'src/entities/sport-position.entity';
import { Branch } from 'src/entities/branch.entity';
import { CompanyModule } from '../company/company.module';
import { AthletesModule } from '../athletes/athletes.module';
import { ReservationsModule } from '../reservation/reservation.module';
import { DataMigrationController } from './data-migration.controller';
import { DataMigrationService } from './data-migration.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Company,
      User,
      AthleteInvitation,
      AthleteSchedule,
      Division,
      SportPosition,
      Branch,
    ]),
    CompanyModule,
    AthletesModule,
    forwardRef(() => ReservationsModule),
  ],
  controllers: [DataMigrationController],
  providers: [DataMigrationService],
})
export class DataMigrationModule {}
