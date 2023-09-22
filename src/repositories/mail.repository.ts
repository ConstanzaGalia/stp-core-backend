import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { MailInterface } from '../models/interfaces/mail.interface';

export class MailRepository {
  constructor(
    @InjectModel('Mail')
    private model: Model<MailInterface>,
  ) {}

  async saveMail(
    email: string,
    subject: string,
    status: string,
    errorPurpose?: boolean,
  ): Promise<MailInterface> {
    const mail = new this.model({ email, subject, status, errorPurpose });
    return await mail.save();
  }
}