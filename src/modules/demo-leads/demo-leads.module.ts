import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DemoLead } from 'src/entities/demo-lead.entity';
import { DemoLeadEvent } from 'src/entities/demo-lead-event.entity';
import { DemoLeadAttempt } from 'src/entities/demo-lead-attempt.entity';
import { MailingModule } from '../mailer/mailing.module';
import { DemoLeadsAdminController } from './demo-leads-admin.controller';
import { DemoLeadsPublicController } from './demo-leads-public.controller';
import { DemoLeadsService } from './demo-leads.service';
import { MetaCapiService } from './meta-capi.service';

@Module({
  imports: [TypeOrmModule.forFeature([DemoLead, DemoLeadEvent, DemoLeadAttempt]), MailingModule],
  controllers: [DemoLeadsPublicController, DemoLeadsAdminController],
  providers: [DemoLeadsService, MetaCapiService],
})
export class DemoLeadsModule {}
