import { IsString, IsDateString, IsInt, IsBoolean, IsOptional, Min, Max } from 'class-validator';

export class UpdateScheduleExceptionDto {
  @IsDateString()
  @IsOptional()
  exceptionDate?: string;

  @IsString()
  @IsOptional()
  startTime?: string;

  @IsString()
  @IsOptional()
  endTime?: string;

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
  reason?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
