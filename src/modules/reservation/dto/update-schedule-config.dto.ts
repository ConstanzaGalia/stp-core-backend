import { IsString, IsInt, IsBoolean, Min, Max, IsOptional } from 'class-validator';

export class UpdateScheduleConfigDto {
  @IsInt()
  @Min(0)
  @Max(6)
  @IsOptional()
  dayOfWeek?: number;

  @IsString()
  @IsOptional()
  startTime?: string;

  @IsString()
  @IsOptional()
  endTime?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  capacity?: number;

  @IsBoolean()
  @IsOptional()
  allowIntermediateSlots?: boolean;

  @IsInt()
  @Min(1)
  @IsOptional()
  intermediateCapacity?: number;

  @IsInt()
  @Min(15)
  @Max(180)
  @IsOptional()
  slotDurationMinutes?: number;

  @IsInt()
  @Min(15)
  @Max(120)
  @IsOptional()
  intermediateSlotDurationMinutes?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
} 