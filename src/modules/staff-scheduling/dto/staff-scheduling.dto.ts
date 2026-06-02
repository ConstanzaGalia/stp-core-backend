import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { StaffPayType } from '../../../entities/staff-compensation-profile.entity';

export class UpsertStaffCellDto {
  @IsDateString()
  date: string;

  @IsString()
  startTime: string;

  @IsString()
  endTime: string;

  @IsInt()
  @Min(1)
  durationMinutes: number;

  @IsBoolean()
  isClosed: boolean;

  @IsArray()
  @IsUUID('4', { each: true })
  userIds: string[];
}

export class UpsertWeekAssignmentsDto {
  @IsOptional()
  @IsString()
  note?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpsertStaffCellDto)
  cells: UpsertStaffCellDto[];
}

export class UpsertCompensationProfileDto {
  @IsUUID()
  userId: string;

  @IsEnum(StaffPayType)
  payType: StaffPayType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  hourlyRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  fixedMonthlyAmount?: number;

  @IsOptional()
  @IsString()
  displayColor?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateCompensationBatchDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpsertCompensationProfileDto)
  profiles: UpsertCompensationProfileDto[];
}

export class CopyWeekDto {
  @IsDateString()
  sourceWeekStart: string;
}

export class PayrollQueryDto {
  @IsInt()
  @Min(2000)
  @Max(2100)
  year: number;

  @IsInt()
  @Min(1)
  @Max(12)
  month: number;
}
