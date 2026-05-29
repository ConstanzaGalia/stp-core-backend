import { Controller, Get } from '@nestjs/common';
import { SkipCompanySubscriptionCheck } from 'src/common/decorators/skip-company-subscription-check.decorator';

@Controller()
@SkipCompanySubscriptionCheck()
export class HealthController {
  @Get()
  root() {
    return { status: 'ok', service: 'stp-api' };
  }

  @Get('health')
  health() {
    return { status: 'ok', service: 'stp-api' };
  }
}
