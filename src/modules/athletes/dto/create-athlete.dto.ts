import { IsBoolean, IsEmail, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Max, Min, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateAthleteDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsString()
  lastName: string;

  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsOptional()
  @IsBoolean()
  isOnline?: boolean;

  /** Fecha de nacimiento en formato YYYY-MM-DD */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateOfBirth debe ser YYYY-MM-DD' })
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  dni?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  /** Si es true, el participante solo se gestiona desde el hub de evaluaciones (no en roster de alumnos). */
  @IsOptional()
  @IsBoolean()
  evaluationPortalOnly?: boolean;

  @IsOptional()
  @ValidateIf((_, v) => v != null && v !== '')
  @IsIn(['femenino', 'masculino'])
  sexo?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Type(() => Number)
  @IsNumber()
  @Min(20)
  @Max(250)
  peso?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Type(() => Number)
  @IsNumber()
  @Min(100)
  @Max(250)
  altura?: number | null;
}
