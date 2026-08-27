import { Controller, Get } from '@nestjs/common';
import { SkipCompanySubscriptionCheck } from 'src/common/decorators/skip-company-subscription-check.decorator';
import { PaymentsService } from './payments.service';

@Controller('payments/public')
@SkipCompanySubscriptionCheck()
export class PaymentsPublicController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('plans')
  async getOperatingPlans() {
    return this.paymentsService.getPublicOperatingPlans();
  }
}
