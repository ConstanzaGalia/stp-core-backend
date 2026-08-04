import { IsBoolean, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

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
  @MaxLength(40)
  testType?: string;

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
  @MaxLength(40)
  testType?: string;

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
