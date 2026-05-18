import { IsNotEmpty, IsOptional, IsString, IsArray, IsBoolean, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateExerciseDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  video?: string;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  primaryCategoryId?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  movementPatternId?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  material?: string[];

  @IsOptional()
  @IsBoolean()
  unilateral?: boolean;

  @IsOptional()
  @IsBoolean()
  esIsometrico?: boolean;

  @IsOptional()
  @IsBoolean()
  isAncla?: boolean;

  @IsOptional()
  @IsBoolean()
  carga?: boolean;

  @IsOptional()
  @IsBoolean()
  impacto?: boolean;

  @IsOptional()
  @IsBoolean()
  rotacion?: boolean;

  @IsOptional()
  @IsBoolean()
  multiarticular?: boolean;

  @IsOptional()
  @IsBoolean()
  inestabilidad?: boolean;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  safetyTagIds?: number[];

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  tagIds?: number[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  faseRecomendada?: string[];
}
