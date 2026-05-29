import { SetMetadata } from '@nestjs/common';

export const SKIP_COMPANY_SUBSCRIPTION_CHECK = 'skipCompanySubscriptionCheck';

export const SkipCompanySubscriptionCheck = () =>
  SetMetadata(SKIP_COMPANY_SUBSCRIPTION_CHECK, true);
