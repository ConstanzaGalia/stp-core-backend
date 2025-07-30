import { IsString, IsInt, IsBoolean, Min, Max, IsOptional } from 'class-validator';

export class CreateScheduleConfigDto {
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek: number; // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado

  @IsString()
  startTime: string; // Formato "HH:MM"

  @IsString()
  endTime: string; // Formato "HH:MM"

  @IsInt()
  @Min(1)
  capacity: number; // Capacidad por hora

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
} 