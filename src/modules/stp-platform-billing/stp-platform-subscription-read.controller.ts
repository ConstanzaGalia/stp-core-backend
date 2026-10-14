import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GetUser } from '../auth/get-user.decorator';
import { User } from 'src/entities/user.entity';
import { SkipCompanySubscriptionCheck } from 'src/common/decorators/skip-company-subscription-check.decorator';
import { ParseSanitizedUUIDPipe } from 'src/common/pipes/parse-sanitized-uuid.pipe';
import { AttachPlatformReceiptDto } from './dto/platform-billing.dto';
import { StpPlatformBillingService } from './stp-platform-billing.service';

@Controller('company')
@UseGuards(AuthGuard('jwt'))
@SkipCompanySubscriptionCheck()
export class StpPlatformSubscriptionReadController {
  constructor(private readonly billingService: StpPlatformBillingService) {}

  @Get(':companyId/platform-subscription')
  async getCompanySubscription(
    @Param('companyId', ParseSanitizedUUIDPipe) companyId: string,
    @GetUser() user: User,
  ) {
    return this.billingService.getCompanySubscriptionView(companyId, user);
  }

  @Post(':companyId/platform-charges/:chargeId/receipt')
  async attachReceipt(
    @Param('companyId', ParseSanitizedUUIDPipe) companyId: string,
    @Param('chargeId', ParseSanitizedUUIDPipe) chargeId: string,
    @Body() dto: AttachPlatformReceiptDto,
    @GetUser() user: User,
  ) {
    return this.billingService.attachReceipt(companyId, chargeId, dto, user);
  }
}
