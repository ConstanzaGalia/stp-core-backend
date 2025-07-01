import { Module } from '@nestjs/common';
import { MailingController } from './mailing.controller';
import { MailingService } from './mailing.service';
import { ConfigService } from '@nestjs/config';
import { ResendService } from '../../services/resend.service';

@Module({
  controllers: [MailingController],
  providers: [MailingService, ConfigService, ResendService],
  imports: [],
  exports: [MailingService, ResendService],
})
export class MailingModule {}
