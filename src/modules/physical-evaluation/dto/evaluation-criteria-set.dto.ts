import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateEvaluationCriteriaSetDto {
  @IsString()
  @MaxLength(80)
  code: string;

  @IsString()
  @MaxLength(160)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  sport?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  ageGroup?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  sex?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  testType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  protocolCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  version?: string;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string | null;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string | null;

  @IsOptional()
  @IsIn(['manual', 'historical'])
  source?: 'manual' | 'historical';

  @IsOptional()
  @IsInt()
  @Min(1)
  sampleSize?: number | null;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsObject()
  thresholds: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateEvaluationCriteriaSetDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  sport?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  ageGroup?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  sex?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  testType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  protocolCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  version?: string;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string | null;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string | null;

  @IsOptional()
  @IsIn(['manual', 'historical'])
  source?: 'manual' | 'historical';

  @IsOptional()
  @IsInt()
  @Min(1)
  sampleSize?: number | null;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsObject()
  thresholds?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
