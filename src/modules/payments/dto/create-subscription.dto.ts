import { IsString, IsDateString, IsBoolean, IsOptional } from 'class-validator';

export class CreateSubscriptionDto {
  @IsString()
  userId: string;

  @IsString()
  paymentPlanId: string;

  @IsDateString()
  startDate: string; // Fecha de inicio (primer día del mes)

  @IsBoolean()
  @IsOptional()
  autoRenew?: boolean; // Siempre true para renovación mensual

  @IsString()
  @IsOptional()
  notes?: string;
}

