import { Controller, Post, Body, HttpStatus, Res, Get, Param, NotFoundException, ForbiddenException } from '@nestjs/common';
import { MailingService } from './mailing.service';
import { buildTestEmailHtml, getEmailLogoUrl } from '../../utils/emailBrand';
import { buildEmailPreviewHtml, isEmailPreviewType } from '../../utils/emailPreview';

@Controller('mailing')
export class MailingController {
  constructor(
    private readonly mailingService: MailingService,
  ) {}

  @Get('/config')
  async getConfig(@Res() res) {
    try {
      const config = {
        hasApiKey: !!process.env.RESEND_API_KEY,
        apiKeyLength: process.env.RESEND_API_KEY ? process.env.RESEND_API_KEY.length : 0,
        fromEmail: process.env.RESEND_FROM_EMAIL || 'not-set',
        logoUrl: getEmailLogoUrl(),
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

  @Get('/preview/:type')
  async previewEmail(@Res() res, @Param('type') type: string) {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Email preview is only available in development');
    }

    if (!isEmailPreviewType(type)) {
      throw new NotFoundException(
        `Unknown preview type: ${type}. Valid types: register, reset, invite, approval, notify, test`,
      );
    }

    const html = buildEmailPreviewHtml(type);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(HttpStatus.OK).send(html);
  }

  @Post('/test')
  async testEmail(@Res() res, @Body() body: { email: string }) {
    try {
      if (!body.email || body.email.trim() === '') {
        return res.status(HttpStatus.BAD_REQUEST).json({
          message: 'Email is required',
          success: false,
        });
      }

      const testMail = {
        to: body.email.trim(),
        subject: 'Test Email - STP',
        html: buildTestEmailHtml(),
        from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
      };

      await this.mailingService.sendMail(testMail);

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
