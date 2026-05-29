import { IsBoolean } from 'class-validator';

export class UpdateCompanySubscriptionDto {
  @IsBoolean()
  subscriptionActive: boolean;
}
