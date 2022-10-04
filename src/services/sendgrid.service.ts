import { Injectable } from '@nestjs/common';
import * as SendGrid from '@sendgrid/mail';

@Injectable()
export class SendgridService {
  constructor(){
    SendGrid.setApiKey(process.env.SEND_GRID_KEY)
  }
  async send(mail: SendGrid.MailDataRequired) {
    try {
      await SendGrid.send(mail);
      return `E-Mail sent to ${mail.to}`;
    } catch (error) {
      console.log(error.response.body.errors)
    }
  }
}
