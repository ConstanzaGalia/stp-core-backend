import { Controller, Post, Body, HttpStatus, Res, Get } from '@nestjs/common';
import { MailingService } from './mailing.service';
import { ResendService } from '../../services/resend.service';

@Controller('mailing')
export class MailingController {
  constructor(
    private readonly mailingService: MailingService,
    private readonly resendService: ResendService,
  ) {}

  @Get('/config')
  async getConfig(@Res() res) {
    try {
      const config = {
        hasApiKey: !!process.env.RESEND_API_KEY,
        apiKeyLength: process.env.RESEND_API_KEY ? process.env.RESEND_API_KEY.length : 0,
        fromEmail: process.env.RESEND_FROM_EMAIL || 'not-set',
        nodeEnv: process.env.NODE_ENV || 'development',
      };

      return res.status(HttpStatus.OK).json({
        message: 'Resend configuration',
        config,
        success: true,
      });
    } catch (error) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        message: 'Error getting config',
        error: error.message,
        success: false,
      });
    }
  }

  @Post('/test')
  async testEmail(@Res() res, @Body() body: { email: string }) {
    try {
      // Validar que el email esté presente
      if (!body.email || body.email.trim() === '') {
        return res.status(HttpStatus.BAD_REQUEST).json({
          message: 'Email is required',
          success: false,
        });
      }

      const testMail = {
        to: body.email.trim(),
        subject: 'Test Email - STP Backend',
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <title>Test Email</title>
            </head>
            <body>
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #333;">¡Test de Email Exitoso!</h2>
                <div style="background-color: #d4edda; padding: 15px; border-radius: 5px; border: 1px solid #c3e6cb;">
                  <p style="color: #155724; margin: 0;">
                    Este es un email de prueba para verificar que Resend está funcionando correctamente.
                  </p>
                </div>
                <p style="color: #666; font-size: 12px; margin-top: 20px;">
                  Enviado desde STP Backend con Resend
                </p>
              </div>
            </body>
          </html>
        `,
        from: 'onboarding@resend.dev', // Usar directamente el dominio de prueba
      };

      await this.resendService.sendEmail(
        testMail.to,
        testMail.subject,
        testMail.html,
        testMail.from
      );

      return res.status(HttpStatus.OK).json({
        message: `Test email sent successfully to ${body.email}`,
        success: true,
      });
    } catch (error) {
      console.error('Error in test endpoint:', error);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        message: 'Error sending test email',
        error: error.message,
        success: false,
      });
    }
  }
}
