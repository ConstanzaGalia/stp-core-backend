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
  isActive?: boolean;
} 