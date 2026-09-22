import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  StpPlatformBillingKind,
  StpPlatformChargeConcept,
  StpPlatformChargeStatus,
  StpPlatformPaymentMethod,
  StpPlatformPlan,
  StpPlatformSubscriptionStatus,
} from 'src/common/enums/enums';

export class AssignPlatformSubscriptionDto {
  @IsEnum(StpPlatformPlan)
  plan: StpPlatformPlan;

  @IsEnum(StpPlatformBillingKind)
  billingKind: StpPlatformBillingKind;

  @IsDateString()
  periodStart: string;

  @ValidateIf((o) => o.billingKind === StpPlatformBillingKind.PAID)
  @IsOptional()
  @IsDateString()
  periodEnd?: string | null;

  @ValidateIf((o) => o.billingKind === StpPlatformBillingKind.PAID)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  subscriptionAmount?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsString()
  notes?: string | null;

  /** Si true y PAID, el cargo de suscripción se crea ya como pagado. */
  @IsOptional()
  @IsBoolean()
  markSubscriptionPaid?: boolean;

  @ValidateIf((o) => o.markSubscriptionPaid === true)
  @IsOptional()
  @IsEnum(StpPlatformPaymentMethod)
  paymentMethod?: StpPlatformPaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  paymentReference?: string | null;
}

export class UpdatePlatformSubscriptionDto {
  @IsOptional()
  @IsEnum(StpPlatformSubscriptionStatus)
  status?: StpPlatformSubscriptionStatus;

  @IsOptional()
  @IsDateString()
  periodStart?: string;

  @IsOptional()
  @IsDateString()
  periodEnd?: string | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  subscriptionAmount?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class CreatePlatformChargeDto {
  @IsEnum(StpPlatformChargeConcept)
  concept: StpPlatformChargeConcept;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsEnum(StpPlatformChargeStatus)
  status?: StpPlatformChargeStatus;

  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @IsOptional()
  @IsUUID()
  subscriptionId?: string | null;

  @ValidateIf((o) => o.status === StpPlatformChargeStatus.PAID)
  @IsOptional()
  @IsEnum(StpPlatformPaymentMethod)
  method?: StpPlatformPaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reference?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsDateString()
  paidAt?: string | null;
}

export class UpdatePlatformChargeDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsEnum(StpPlatformChargeStatus)
  status?: StpPlatformChargeStatus;

  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @IsOptional()
  @IsEnum(StpPlatformPaymentMethod)
  method?: StpPlatformPaymentMethod | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reference?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsDateString()
  paidAt?: string | null;
}
