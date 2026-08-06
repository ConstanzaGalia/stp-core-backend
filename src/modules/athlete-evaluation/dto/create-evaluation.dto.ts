import { IsInt, Min, Max, IsOptional, IsString, IsNumber, MaxLength, IsIn, ValidateIf } from 'class-validator';

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
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsNumber()
  peso?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsNumber()
  altura?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v != null && v !== '')
  @IsIn(['femenino', 'masculino'])
  sexo?: string | null;

  @IsOptional()
  @IsString()
  objetivo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  primarySport?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  clubName?: string;
}
