import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsArray,
  IsNumber,
  IsEnum,
  IsDateString,
  IsBoolean,
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

  /**
   * Si se informa (y no es permanente), el registro se crea ya finalizado.
   */
  @IsOptional()
  @IsDateString()
  fechaResolucion?: string;

  /** Condición crónica / permanente sin fecha de fin. */
  @IsOptional()
  @IsBoolean()
  permanente?: boolean;

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

  /** Fecha de fin / resolución al marcar resuelta. */
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

  /**
   * Fecha de fin. Enviar `null` o `""` para borrarla y reactivar el registro.
   */
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsDateString()
  fechaResolucion?: string | null;

  @IsOptional()
  @IsBoolean()
  permanente?: boolean;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  restrictionTagIds?: number[];
}
