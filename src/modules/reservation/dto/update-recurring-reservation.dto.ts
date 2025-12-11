import { IsArray, IsString, IsOptional, IsInt, Min, Max, IsEnum } from 'class-validator';
import { ScheduleStatus } from 'src/entities/athlete-schedule.entity';

export class UpdateRecurringReservationDto {
  @IsArray()
  @IsOptional()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  daysOfWeek?: number[]; // Ejemplo: [1, 3, 5] (Lunes, Miércoles, Viernes)

  @IsString()
  @IsOptional()
  startTime?: string; // Ejemplo: "08:00"

  @IsString()
  @IsOptional()
  endTime?: string; // Ejemplo: "09:00"

  @IsEnum(ScheduleStatus)
  @IsOptional()
  status?: ScheduleStatus;

  @IsString()
  @IsOptional()
  notes?: string;
}

