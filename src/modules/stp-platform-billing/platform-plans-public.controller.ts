import { Controller, Get } from '@nestjs/common';
import { SkipCompanySubscriptionCheck } from 'src/common/decorators/skip-company-subscription-check.decorator';
import { listPublicPlatformPlans } from './platform-plans.config';

/** Precios y textos de los planes comerciales. Sin login. */
@Controller('public/platform-plans')
@SkipCompanySubscriptionCheck()
export class PlatformPlansPublicController {
  @Get()
  list() {
    return {
      plans: listPublicPlatformPlans(),
      trialDays: Number(process.env.PLATFORM_TRIAL_DAYS) || 14,
      updatedNote: 'Actualización trimestral por IPC',
    };
  }
}
