import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const MAX_TESTS = 30;

export class PhysicalEvaluationTestInputDto {
  @IsString()
  @MaxLength(200)
  testName: string;

  @IsString()
  @MaxLength(120)
  testType: string;

  @IsObject()
  metrics: Record<string, unknown>;
}

export class CreatePhysicalEvaluationDto {
  @IsDateString()
  evaluationDate: string;

  @IsArray()
  @ArrayMaxSize(MAX_TESTS)
  @ValidateNested({ each: true })
  @Type(() => PhysicalEvaluationTestInputDto)
  tests: PhysicalEvaluationTestInputDto[];

  /** Solo staff: sobrescribe el score calculado. */
  @IsOptional()
  @IsNumber()
  summaryScoreOverride?: number;

  /** Solo staff: sobrescribe el análisis generado. */
  @IsOptional()
  @IsString()
  @MaxLength(32000)
  summaryAnalysisOverride?: string;
}
