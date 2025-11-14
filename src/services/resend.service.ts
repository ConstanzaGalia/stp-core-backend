import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

@Injectable()
export class ResendService {
  private resend: Resend;

  constructor() {
  console.log('RESEND_API_KEY exists:', !!process.env.RESEND_API_KEY);
  console.log('API Key starts with re_:', process.env.RESEND_API_KEY?.startsWith('re_'));
    this.resend = new Resend(process.env.RESEND_API_KEY);
  }

  async sendEmail(to: string, subject: string, html: string, from?: string) {
    try {
      // Validar que el email no sea null, undefined o vacío
      if (!to || to.trim() === '') {
        throw new Error('Email address is required and cannot be empty');
      }

      // Validar formato básico de email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(to)) {
        throw new Error(`Invalid email format: ${to}`);
      }

      Logger.log(`Attempting to send email to: ${to}`);

      const { data, error } = await this.resend.emails.send({
        from: from || process.env.RESEND_FROM_EMAIL || 'noreply@yourdomain.com',
        to: [to],
        subject,
        html,
      });

      if (error) {
        Logger.error('Error sending email with Resend:', error);
        throw error;
      }

      Logger.log(`Email sent successfully to ${to}`);
      return data;
    } catch (error) {
      Logger.error(`Failed to send email to ${to}:`, error);
      throw error;
    }
  }

  async sendEmailWithTemplate(to: string, subject: string, templateId: string, templateData: any, from?: string) {
    try {
      const { data, error } = await this.resend.emails.send({
        from: from || process.env.RESEND_FROM_EMAIL || 'noreply@yourdomain.com',
        to: [to],
        subject,
        html: `<div>Template ID: ${templateId}</div><div>Data: ${JSON.stringify(templateData)}</div>`,
      });

      if (error) {
        Logger.error('Error sending email with template:', error);
        throw error;
      }

      Logger.log(`Email with template sent successfully to ${to}`);
      return data;
    } catch (error) {
      Logger.error(`Failed to send email with template to ${to}:`, error);
      throw error;
    }
  }
} 