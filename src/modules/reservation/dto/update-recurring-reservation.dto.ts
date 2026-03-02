import { IsArray, IsString, IsOptional, IsInt, Min, Max, IsEnum } from 'class-validator';
import { Transform } from 'class-transformer';
import { ScheduleStatus } from 'src/entities/athlete-schedule.entity';

function toDaysOfWeekArray(value: unknown): number[] | undefined {
  if (value == null) return undefined;
  if (Array.isArray(value)) {
    return value.map((v) => (typeof v === 'string' ? Number(v) : Number(v))).filter((n) => !Number.isNaN(n));
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => !Number.isNaN(n));
  }
  return undefined;
}

export class UpdateRecurringReservationDto {
  @Transform(({ value }) => toDaysOfWeekArray(value))
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

