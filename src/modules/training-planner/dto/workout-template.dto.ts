import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateWorkoutCollectionDto {
  @IsString()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateWorkoutCollectionDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateWorkoutTemplateDto {
  @IsString()
  @MaxLength(150)
  name: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phase?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  pattern?: string | null;

  /** null limpia la colección; undefined no toca el campo en update. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  collectionId?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsArray()
  blocks?: unknown[];

  @IsOptional()
  @IsString()
  enduranceFormat?: string | null;

  @IsOptional()
  enduranceConfig?: Record<string, unknown> | null;
}

export class UpdateWorkoutTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phase?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  pattern?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  collectionId?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  blocks?: unknown[];

  @IsOptional()
  @IsString()
  enduranceFormat?: string | null;

  @IsOptional()
  enduranceConfig?: Record<string, unknown> | null;
}

export class InstantiateWorkoutTemplateDto {
  @IsUUID()
  athleteId: string;

  @IsString()
  scheduledDate: string;

  @IsString()
  macroWeekId: string;

  @IsString()
  weekStartDate: string;

  @IsString()
  weekLabel: string;

  @IsInt()
  @Min(1)
  sessionOrdinal: number;

  @IsOptional()
  @IsString()
  macroPlanId?: string | null;

  @IsOptional()
  @IsString()
  phase?: string;

  @IsOptional()
  @IsString()
  weekType?: string;

  @IsOptional()
  @IsString()
  pattern?: string;

  @IsOptional()
  @IsString()
  templateId?: string;

  @IsOptional()
  @IsString()
  templateDayId?: string;

  @IsOptional()
  progressionConfig?: unknown;

  /** Si viene, se usa en lugar de template.blocks (p. ej. solo ejercicios). */
  @IsOptional()
  @IsArray()
  blocks?: unknown[];
}

export class PublishSessionDto {
  @IsUUID()
  athleteId: string;
}

export class UpdateSessionCompletionDto {
  @IsUUID()
  athleteId: string;

  @IsString()
  athleteCompletionStatus: 'pending' | 'completed' | 'skipped';
}

/** Progreso propio del atleta (asistencia sesión/circuitos, fecha libre). No modifica la planilla. */
export class UpdateAthleteOwnProgressDto {
  @IsUUID()
  athleteId: string;

  @IsOptional()
  @IsString()
  athleteCompletionStatus?: 'pending' | 'completed' | 'skipped';

  @IsOptional()
  @IsString()
  scheduledDate?: string;

  /** Solo se aplican id + athleteCompletionStatus por bloque; no se pisan ejercicios. */
  @IsOptional()
  @IsArray()
  blocks?: Array<{ id: string; athleteCompletionStatus?: string }>;
}
