import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsArray,
  IsNumber,
  IsEnum,
  IsDateString,
  ValidateIf,
} from 'class-validator';
import { InjuryKind, InjuryStatus } from 'src/entities/injury.entity';

export class CreateInjuryDto {
  @IsNotEmpty()
  @IsString()
  tipo: string;

  @IsOptional()
  @IsEnum(InjuryKind)
  kind?: InjuryKind;

  @IsNotEmpty()
  @IsDateString()
  fechaInicio: string;

  @IsOptional()
  @IsString()
  notas?: string;

  /** Si se informa, el registro se crea ya finalizado con esta fecha de fin. */
  @IsOptional()
  @IsDateString()
  fechaResolucion?: string;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  restrictionTagIds?: number[];
}

export class UpdateInjuryStatusDto {
  @IsNotEmpty()
  @IsEnum(InjuryStatus)
  estado: InjuryStatus;

  @IsOptional()
  @IsString()
  notas?: string;

  /** Fecha de fin / resolución. Obligatoria al marcar resuelta si se envía explícitamente. */
  @ValidateIf((dto) => dto.estado === InjuryStatus.RESUELTA)
  @IsOptional()
  @IsDateString()
  fechaResolucion?: string;
}

export class UpdateInjuryDto {
  @IsOptional()
  @IsString()
  tipo?: string;

  @IsOptional()
  @IsEnum(InjuryKind)
  kind?: InjuryKind;

  @IsOptional()
  @IsDateString()
  fechaInicio?: string;

  @IsOptional()
  @IsString()
  notas?: string;

  @IsOptional()
  @IsDateString()
  fechaResolucion?: string;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  restrictionTagIds?: number[];
}
