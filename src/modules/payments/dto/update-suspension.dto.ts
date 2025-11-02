import { IsDateString, IsOptional, IsString, IsBoolean } from 'class-validator';

export class UpdateSuspensionDto {
  @IsDateString()
  @IsOptional()
  startDate?: string; // Fecha de inicio de la suspensión (YYYY-MM-DD)

  @IsDateString()
  @IsOptional()
  endDate?: string; // Fecha de fin de la suspensión (YYYY-MM-DD)

  @IsString()
  @IsOptional()
  reason?: string; // Razón de la suspensión

  @IsString()
  @IsOptional()
  notes?: string; // Notas adicionales

  @IsBoolean()
  @IsOptional()
  isActive?: boolean; // Si la suspensión está activa
}

