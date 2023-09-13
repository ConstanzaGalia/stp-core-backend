import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailerService } from '@nestjs-modules/mailer';
import { google } from 'googleapis';
import { Options } from 'nodemailer/lib/smtp-transport';
@Injectable()
export class MailingService {
  constructor(
    private readonly configService: ConfigService,
    private readonly mailerService: MailerService,
  ) {}

  private async setTransport() {
    const OAuth2 = google.auth.OAuth2;
    const oauth2Client = new OAuth2(
      this.configService.get('NODEMAILER_GOOGLE_CLIENT_ID'),
      this.configService.get('NODEMAILER_GOOGLE_SECRET_CLIENT'),
      this.configService.get('GOOGLE_DEV_OAUTH_PLAYGROUND_URL'),
    );

    oauth2Client.setCredentials({
      refresh_token: process.env.NODEMAILER_REFESH_TOKEN,
    });

    const accessToken: string = await new Promise((resolve, reject) => {
      oauth2Client.getAccessToken((err, token) => {
        if (err) {
          reject('Failed to create access token');
        }
        resolve(token);
      });
    });

    const config: Options = {
      service: 'gmail',
      auth: {
        type: 'OAuth2',
        user: this.configService.get('NODEMAILER_USER'),
        clientId: this.configService.get('NODEMAILER_GOOGLE_CLIENT_ID'),
        clientSecret: this.configService.get('NODEMAILER_GOOGLE_SECRET_CLIENT'),
        accessToken,
      },
    };
    this.mailerService.addTransporter('gmail', config);
  }

  public async sendMail(configEmail: any) {
    await this.setTransport();
    this.mailerService
      .sendMail({
        transporterName: 'gmail',
        template: 'action',
        ...configEmail,
        context: {
          // Data to be sent to template engine..
          code: '38320',
        },
      })
      .then((success) => {
        console.log(success);
      })
      .catch((err) => {
        console.log(err);
      });
  }


}

