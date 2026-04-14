import { IsDateString, IsUUID } from 'class-validator';

export class CreateEvaluacionDto {
  @IsUUID()
  athleteId: string;

  @IsDateString()
  evaluationDate: string;
}
