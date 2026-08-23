import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

const OBSERVATION_CODES = ['adecuado', 'compensado', 'limitado'] as const;

export class CreateScreeningSessionDto {
  @IsOptional()
  @IsDateString()
  evaluationDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class QuantitativeDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(40)
  leftCm?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(40)
  rightCm?: number | null;
}

export class SidePainDto {
  @IsOptional()
  @IsBoolean()
  left?: boolean;

  @IsOptional()
  @IsBoolean()
  right?: boolean;
}

export class LandingAttemptsDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  familiarization?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  valid?: number | null;
}

export class SaveScreeningTestDto {
  @IsOptional()
  @IsObject()
  observations?: Record<string, (typeof OBSERVATION_CODES)[number]>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  compensations?: string[];

  @IsOptional()
  @IsString()
  primaryCompensation?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => QuantitativeDto)
  quantitative?: QuantitativeDto;

  @IsOptional()
  @IsObject()
  sideObservations?: {
    left?: Record<string, (typeof OBSERVATION_CODES)[number]>;
    right?: Record<string, (typeof OBSERVATION_CODES)[number]>;
  };

  @IsOptional()
  @IsObject()
  sideCompensations?: {
    left?: string[];
    right?: string[];
  };

  @IsOptional()
  @ValidateNested()
  @Type(() => SidePainDto)
  sidePain?: SidePainDto;

  @IsOptional()
  @IsBoolean()
  hasPain?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  invalidReasons?: string[];

  @IsOptional()
  @IsString()
  videoUrl?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => LandingAttemptsDto)
  attempts?: LandingAttemptsDto | null;
}

export class CompleteScreeningSessionDto {
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateScreeningNotesDto {
  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsIn(['knee_to_wall', 'deep_squat_overhead', 'hip_hinge', 'single_leg_squat', 'landing_bilateral'])
  currentTestCode?: string;
}
