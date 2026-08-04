import { IsOptional, IsUUID, ValidateIf } from 'class-validator';

export class UpdateEvaluationCriteriaDto {
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsUUID()
  criteriaSetId?: string | null;
}
