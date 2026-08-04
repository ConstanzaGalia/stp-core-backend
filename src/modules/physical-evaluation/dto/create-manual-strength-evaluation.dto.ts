import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class ManualStrengthLiftDto {
  @IsNumber()
  @Min(0.5)
  @Max(500)
  @Type(() => Number)
  loadKg: number;

  @IsInt()
  @Min(1)
  @Max(12)
  @Type(() => Number)
  reps: number;

  @IsInt()
  @Min(0)
  @Max(5)
  @Type(() => Number)
  rir: number;
}

export class ManualStrengthLiftsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ManualStrengthLiftDto)
  squat?: ManualStrengthLiftDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ManualStrengthLiftDto)
  bench?: ManualStrengthLiftDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ManualStrengthLiftDto)
  deadlift?: ManualStrengthLiftDto;
}

export class CreateManualStrengthEvaluationDto {
  @IsUUID()
  athleteId: string;

  @IsDateString()
  evaluationDate: string;

  @ValidateNested()
  @Type(() => ManualStrengthLiftsDto)
  lifts: ManualStrengthLiftsDto;
}
