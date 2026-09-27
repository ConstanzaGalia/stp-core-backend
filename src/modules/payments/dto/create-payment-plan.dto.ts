import { IsString, IsNumber, IsBoolean, IsOptional, IsIn, Min, Max } from 'class-validator';

export class CreatePaymentPlanDto {
  @IsString()
  name: string; // "Plan 2x Semana", "Plan 3x Semana", etc.

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @Min(0)
  amount: number; // Monto mensual

  @IsOptional()
  @IsIn(['ARS', 'USD', 'EUR'])
  currency?: 'ARS' | 'USD' | 'EUR';

  @IsNumber()
  @Min(1)
  classesPerWeek: number; // Con tope semanal: 1 a 5. Sin tope: puede igualar el cupo del período

  @IsBoolean()
  @IsOptional()
  enforceWeeklyLimit?: boolean; // Por defecto true. false = cupo libre dentro del período

  @IsNumber()
  @Min(1)
  maxClassesPerPeriod: number; // Total de clases en el período (ej: 12 para 3x semana en 30 días)

  @IsNumber()
  @Min(0)
  @IsOptional()
  gracePeriodDays?: number; // Días de gracia para pagar

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  lateFeePercentage?: number; // Recargo por mora

  @IsBoolean()
  @IsOptional()
  allowClassRollover?: boolean; // Si las clases pasan al siguiente mes

  @IsNumber()
  @Min(0)
  @IsOptional()
  maxRolloverClasses?: number; // Máximo de clases que pueden pasar
}
