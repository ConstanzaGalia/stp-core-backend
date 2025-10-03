import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AthletesController } from './athletes.controller';
import { AthletesService } from './athletes.service';
import { AthleteInvitation } from '../../entities/athlete-invitation.entity';
import { User } from '../../entities/user.entity';
import { Company } from '../../entities/company.entity';
import { AuthModule } from '../auth/auth.module';
import { MailingModule } from '../mailer/mailing.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AthleteInvitation,
      User, 
      Company
    ]),
    AuthModule,
    MailingModule
  ],
  controllers: [AthletesController],
  providers: [AthletesService],
  exports: [AthletesService]
})
export class AthletesModule {}
