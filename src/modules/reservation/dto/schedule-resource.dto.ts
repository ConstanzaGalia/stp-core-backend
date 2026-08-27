import { IsEnum, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { ScheduleResourceType } from 'src/common/enums/schedule-resource-type.enum';

export class CreateScheduleResourceDto {
  @IsString()
  @MaxLength(120)
  name: string;

  @IsEnum(ScheduleResourceType)
  @IsOptional()
  type?: ScheduleResourceType;

  @IsInt()
  @Min(1)
  @IsOptional()
  defaultCapacity?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;

  @IsUUID()
  @IsOptional()
  divisionId?: string | null;
}

export class UpdateScheduleResourceDto {
  @IsString()
  @MaxLength(120)
  @IsOptional()
  name?: string;

  @IsEnum(ScheduleResourceType)
  @IsOptional()
  type?: ScheduleResourceType;

  @IsInt()
  @Min(1)
  @IsOptional()
  defaultCapacity?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;

  @IsUUID()
  @IsOptional()
  divisionId?: string | null;

  @IsOptional()
  isActive?: boolean;
}
