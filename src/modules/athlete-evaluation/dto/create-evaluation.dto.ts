import { IsInt, Min, Max, IsOptional, IsString, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateEvaluationDto {
  @IsInt()
  @Min(1)
  @Max(5)
  experiencia: number;

  @IsInt()
  @Min(1)
  @Max(5)
  controlMotor: number;

  @IsInt()
  @Min(1)
  @Max(5)
  capacidadEstructural: number;

  @IsOptional()
  @IsString()
  notas?: string;
}

export class UpdateAthleteProfileDto {
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  peso?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  altura?: number;

  @IsOptional()
  @IsString()
  objetivo?: string;
}
