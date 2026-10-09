import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from 'src/common/pagination/DTOs/pagination-query.dto';

const EXERCISE_PHASES = [
  'adaptacion',
  'hipertrofia_1',
  'hipertrofia_2',
  'fuerza',
  'potencia',
  'resistencia',
] as const;

const EXERCISE_SORTS = ['name', 'category', 'score', 'pattern'] as const;

function emptyToUndefined(value: unknown): unknown {
  if (value === undefined || value === null || value === '' || value === 'all') {
    return undefined;
  }
  return value;
}

function toOptionalNumber(value: unknown): number | undefined {
  const raw = emptyToUndefined(value);
  if (raw === undefined) return undefined;
  const parsed = parseInt(String(raw), 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export class ExerciseListQueryDto extends PaginationQueryDto {
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  companyId: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => emptyToUndefined(value))
  search?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Transform(({ value }) => toOptionalNumber(value))
  categoryId?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Transform(({ value }) => toOptionalNumber(value))
  patternId?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => toOptionalNumber(value))
  maxScore?: number;

  @IsOptional()
  @IsIn(EXERCISE_PHASES)
  @Transform(({ value }) => emptyToUndefined(value))
  phase?: (typeof EXERCISE_PHASES)[number];

  @IsOptional()
  @IsIn(EXERCISE_SORTS)
  @Transform(({ value }) => emptyToUndefined(value))
  sort?: (typeof EXERCISE_SORTS)[number];

  @IsOptional()
  @IsIn(['asc', 'desc'])
  @Transform(({ value }) => {
    const raw = emptyToUndefined(value);
    return typeof raw === 'string' ? raw.toLowerCase() : raw;
  })
  dir?: 'asc' | 'desc';
}
