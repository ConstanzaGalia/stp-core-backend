import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ResendService } from '../../services/resend.service';

@Injectable()
export class MailingService {
  constructor(
    private readonly configService: ConfigService,
    private readonly resendService: ResendService,
  ) {}

  public async sendMail(configEmail: any) {
    try {
      // Si el email ya tiene HTML, usarlo directamente
      if (configEmail.html) {
        await this.resendService.sendEmail(
          configEmail.to,
          configEmail.subject,
          configEmail.html,
          configEmail.from
        );
      } else {
        // Si no tiene HTML, generar un template básico
        const htmlContent = this.generateEmailTemplate(configEmail);
        
        await this.resendService.sendEmail(
          configEmail.email || configEmail.to,
          configEmail.subject || 'Notificación STP',
          htmlContent,
          configEmail.from
        );
      }
      
      Logger.log(`Email sent successfully to ${configEmail.to || configEmail.email}`);
    } catch (error) {
      Logger.error(`Error sending email to ${configEmail.to || configEmail.email}`, error);
      throw error;
    }
  }

  private generateEmailTemplate(configEmail: any): string {
    // Aquí puedes generar el HTML del email basado en el contexto
    // Por ahora, un template básico
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>${configEmail.subject || 'Notificación STP'}</title>
        </head>
        <body>
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #333;">${configEmail.subject || 'Notificación STP'}</h2>
            <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px;">
              ${configEmail.message || 'Este es un mensaje automático del sistema STP.'}
            </div>
            <p style="color: #666; font-size: 12px; margin-top: 20px;">
              Este es un email automático, por favor no respondas a este mensaje.
            </p>
          </div>
        </body>
      </html>
    `;
  }
}

