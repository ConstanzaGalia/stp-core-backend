import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateGroupProgramDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  shortName?: string | null;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  phase?: string;

  @IsString()
  startDate: string;

  @IsInt()
  @Min(1)
  @Max(52)
  weeksCount: number;

  @IsInt()
  @Min(2)
  @Max(5)
  sessionsPerWeek: number;

  /** Días sugeridos para inscripción; si omiten se usan presets. */
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  trainingDays?: number[];
}

export class UpdateGroupProgramDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  shortName?: string | null;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  phase?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(52)
  weeksCount?: number;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(5)
  sessionsPerWeek?: number;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  trainingDays?: number[];

  @IsOptional()
  @IsString()
  status?: string;
}

export class GroupProgramSlotInputDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsInt()
  @Min(1)
  weekIndex: number;

  @IsInt()
  @Min(1)
  @Max(5)
  sessionOrdinal: number;

  /** Legacy opcional; se ignora al materializar. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek?: number | null;

  @IsUUID()
  workoutTemplateId: string;

  @IsOptional()
  @IsString()
  weekType?: string;

  @IsOptional()
  prescriptionOverrides?: Record<string, unknown> | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class ReplaceGroupProgramSlotsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GroupProgramSlotInputDto)
  slots: GroupProgramSlotInputDto[];
}

export class AthleteTrainingDaysDto {
  @IsUUID()
  athleteId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @IsInt({ each: true })
  trainingDays: number[];
}

export class EnrollGroupProgramDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID(undefined, { each: true })
  athleteIds: string[];

  /** Días del lote (aplican a todos salvo override en perAthlete). */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @IsInt({ each: true })
  trainingDays: number[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AthleteTrainingDaysDto)
  perAthlete?: AthleteTrainingDaysDto[];

  @IsOptional()
  @IsInt()
  @Min(1)
  startWeekIndex?: number;
}
