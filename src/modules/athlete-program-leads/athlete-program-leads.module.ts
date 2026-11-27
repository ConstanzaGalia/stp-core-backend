import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AthleteProgramLead } from 'src/entities/athlete-program-lead.entity';
import { AthleteProgramLeadAttempt } from 'src/entities/athlete-program-lead-attempt.entity';
import { MailingModule } from '../mailer/mailing.module';
import { AthleteProgramLeadsAdminController } from './athlete-program-leads-admin.controller';
import { AthleteProgramLeadsPublicController } from './athlete-program-leads-public.controller';
import { AthleteProgramLeadsService } from './athlete-program-leads.service';

@Module({
  imports: [TypeOrmModule.forFeature([AthleteProgramLead, AthleteProgramLeadAttempt]), MailingModule],
  controllers: [AthleteProgramLeadsPublicController, AthleteProgramLeadsAdminController],
  providers: [AthleteProgramLeadsService],
})
export class AthleteProgramLeadsModule {}
