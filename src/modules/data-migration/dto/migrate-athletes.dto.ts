import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

/** Fila cruda del CSV; la validación de negocio vive en el servicio (preview). */
export class MigrateAthleteRowDto {
  @IsString()
  email: string;

  @IsString()
  name: string;

  @IsString()
  lastName: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  dni?: string;

  @IsOptional()
  @IsString()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  sexo?: string | null;

  @IsOptional()
  peso?: number | string | null;

  @IsOptional()
  altura?: number | string | null;

  @IsOptional()
  @Type(() => Number)
  rowNumber?: number;
}

export class MigrateAthletesPreviewDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => MigrateAthleteRowDto)
  rows: MigrateAthleteRowDto[];
}

export class MigrateAthletesConfirmDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => MigrateAthleteRowDto)
  rows: MigrateAthleteRowDto[];

  @IsOptional()
  @IsBoolean()
  updateExisting?: boolean;
}
