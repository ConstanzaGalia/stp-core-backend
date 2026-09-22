import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GetUser } from '../auth/get-user.decorator';
import { User } from 'src/entities/user.entity';
import { SkipCompanySubscriptionCheck } from 'src/common/decorators/skip-company-subscription-check.decorator';
import { StpPlatformBillingService } from './stp-platform-billing.service';
import {
  AssignPlatformSubscriptionDto,
  CreatePlatformChargeDto,
  UpdatePlatformChargeDto,
  UpdatePlatformSubscriptionDto,
} from './dto/platform-billing.dto';

@Controller('company/admin')
@UseGuards(AuthGuard('jwt'))
@SkipCompanySubscriptionCheck()
export class StpPlatformBillingController {
  constructor(private readonly billingService: StpPlatformBillingService) {}

  @Get('platform-billing/stats')
  async getStats(@GetUser() user: User) {
    return this.billingService.getStats(user);
  }

  @Post(':id/platform-subscription')
  async assignSubscription(
    @Param('id') companyId: string,
    @Body() dto: AssignPlatformSubscriptionDto,
    @GetUser() user: User,
  ) {
    return this.billingService.assignSubscription(companyId, dto, user);
  }

  @Patch('platform-subscriptions/:id')
  async updateSubscription(
    @Param('id') subscriptionId: string,
    @Body() dto: UpdatePlatformSubscriptionDto,
    @GetUser() user: User,
  ) {
    return this.billingService.updateSubscription(subscriptionId, dto, user);
  }

  @Get(':id/platform-charges')
  async listCharges(@Param('id') companyId: string, @GetUser() user: User) {
    return this.billingService.listCharges(companyId, user);
  }

  @Post(':id/platform-charges')
  async createCharge(
    @Param('id') companyId: string,
    @Body() dto: CreatePlatformChargeDto,
    @GetUser() user: User,
  ) {
    return this.billingService.createCharge(companyId, dto, user);
  }

  @Patch('platform-charges/:id')
  async updateCharge(
    @Param('id') chargeId: string,
    @Body() dto: UpdatePlatformChargeDto,
    @GetUser() user: User,
  ) {
    return this.billingService.updateCharge(chargeId, dto, user);
  }
}
