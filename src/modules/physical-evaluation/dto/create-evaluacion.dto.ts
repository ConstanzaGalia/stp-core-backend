import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class CreateEvaluacionDto {
  @IsUUID()
  athleteId: string;

  @IsDateString()
  evaluationDate: string;

  @IsOptional()
  @IsUUID()
  criteriaSetId?: string;
}
