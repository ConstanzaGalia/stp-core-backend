import { IsString, IsDateString, IsInt, IsBoolean, IsOptional, Min, Max } from 'class-validator';

export class CreateScheduleExceptionDto {
  @IsDateString()
  exceptionDate: string; // Formato: "2024-01-15"

  @IsString()
  @IsOptional()
  startTime?: string; // Formato: "08:00"

  @IsString()
  @IsOptional()
  endTime?: string; // Formato: "12:00"

  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  capacity?: number;

  @IsBoolean()
  @IsOptional()
  isClosed?: boolean;

  @IsString()
  @IsOptional()
  reason?: string; // "Feriado", "Mantenimiento", etc.
}
