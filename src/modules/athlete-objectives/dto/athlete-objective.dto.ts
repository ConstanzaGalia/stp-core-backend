import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';
import { AthleteObjectiveType } from 'src/entities/athlete-objective.entity';

export class CreateAthleteObjectiveDto {
  @IsNotEmpty()
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNotEmpty()
  @IsEnum(AthleteObjectiveType)
  type: AthleteObjectiveType;

  @ValidateIf((dto) => dto.type === AthleteObjectiveType.SINGLE_DATE)
  @IsNotEmpty()
  @IsDateString()
  targetDate?: string;

  @ValidateIf((dto) => dto.type === AthleteObjectiveType.DATE_RANGE)
  @IsNotEmpty()
  @IsDateString()
  startDate?: string;

  @ValidateIf((dto) => dto.type === AthleteObjectiveType.DATE_RANGE)
  @IsNotEmpty()
  @IsDateString()
  endDate?: string;
}

export class UpdateAthleteObjectiveDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(AthleteObjectiveType)
  type?: AthleteObjectiveType;

  @IsOptional()
  @IsDateString()
  targetDate?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
