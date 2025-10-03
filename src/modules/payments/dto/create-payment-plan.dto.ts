import { IsString, IsNumber, IsBoolean, IsOptional, Min, Max } from 'class-validator';

export class CreatePaymentPlanDto {
  @IsString()
  name: string; // "Plan 2x Semana", "Plan 3x Semana", etc.

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @Min(0)
  amount: number; // Monto mensual

  @IsNumber()
  @Min(1)
  @Max(5)
  classesPerWeek: number; // 1, 2, 3, 4 o 5 clases por semana

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
