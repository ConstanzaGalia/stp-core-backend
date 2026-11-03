import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class SetRepetitionDecisionDto {
  /** `null` vuelve a la regla automática para esa repetición. */
  @ValidateIf((_, value) => value !== null)
  @IsIn(['include', 'exclude'])
  override: 'include' | 'exclude' | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
