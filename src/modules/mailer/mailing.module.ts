import { Module } from '@nestjs/common';
import { MailingController } from './mailing.controller';
import { MailingService } from './mailing.service';
import { ConfigService } from '@nestjs/config';
import { MailRepository } from 'src/repositories/mail.repository';
import { MongooseModule } from '@nestjs/mongoose';
import { MailSchema } from 'src/models/mail.model';

@Module({
  controllers: [MailingController],
  providers: [MailingService, ConfigService, MailRepository],
  imports: [
    MongooseModule.forFeature([
      {
        name: 'Mail',
        schema: MailSchema,
      }
    ])
  ],
})
export class MailingModule {}
