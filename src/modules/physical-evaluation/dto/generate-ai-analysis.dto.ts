import { IsOptional, IsString, MaxLength, IsArray, IsIn, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class AthleteContextDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  sport?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  discipline?: string;

  @IsOptional()
  @IsIn(['amateur', 'semi-professional', 'professional', 'elite'])
  level?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  injuries?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  conditions?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class GenerateAiAnalysisDto {
  @IsOptional()
  @Type(() => AthleteContextDto)
  athleteContext?: AthleteContextDto;

  /** Si es true, regenera aunque ya exista un aiAnalysis previo. */
  @IsOptional()
  @IsBoolean()
  forceRerun?: boolean;
}
