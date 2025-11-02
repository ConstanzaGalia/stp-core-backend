import { IsString, IsDateString, IsOptional } from 'class-validator';

export class CreateSuspensionDto {
  @IsString()
  userId: string; // ID del alumno

  @IsString()
  companyId: string; // ID de la empresa/centro

  @IsDateString()
  startDate: string; // Fecha de inicio de la suspensión (YYYY-MM-DD)

  @IsDateString()
  endDate: string; // Fecha de fin de la suspensión (YYYY-MM-DD)

  @IsString()
  @IsOptional()
  reason?: string; // Razón de la suspensión

  @IsString()
  @IsOptional()
  notes?: string; // Notas adicionales
}

