import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  CompetitionDateType,
  CompetitionStatus,
} from 'src/entities/competition.entity';

export class CreateCompetitionDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsString()
  sport: string;

  @IsNotEmpty()
  @IsEnum(CompetitionDateType)
  dateType: CompetitionDateType;

  @ValidateIf((dto) => dto.dateType === CompetitionDateType.SINGLE_DATE)
  @IsNotEmpty()
  @IsDateString()
  targetDate?: string;

  @ValidateIf((dto) => dto.dateType === CompetitionDateType.DATE_RANGE)
  @IsNotEmpty()
  @IsDateString()
  startDate?: string;

  @ValidateIf((dto) => dto.dateType === CompetitionDateType.DATE_RANGE)
  @IsNotEmpty()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(CompetitionStatus)
  status?: CompetitionStatus;

  @IsOptional()
  @IsString()
  resultSummary?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  divisionIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  participantUserIds?: string[];
}

export class ParticipantMatchDto {
  @IsOptional()
  @IsDateString()
  playedAt?: string;

  @IsOptional()
  @IsString()
  roundLabel?: string;

  @IsOptional()
  @IsString()
  opponent?: string;

  @IsNotEmpty()
  @IsString()
  resultSummary: string;
}

export class ParticipantResultDto {
  @IsNotEmpty()
  @IsUUID('4')
  userId: string;

  @IsOptional()
  @IsString()
  resultSummary?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ParticipantMatchDto)
  matches?: ParticipantMatchDto[];
}

export class UpdateCompetitionDto extends CreateCompetitionDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ParticipantResultDto)
  participantResults?: ParticipantResultDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ParticipantMatchDto)
  groupMatches?: ParticipantMatchDto[];
}

export class UpdateCompetitionResultDto {
  @IsNotEmpty()
  @IsEnum(CompetitionStatus)
  status: CompetitionStatus;

  @IsOptional()
  @IsString()
  resultSummary?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ParticipantResultDto)
  participantResults?: ParticipantResultDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ParticipantMatchDto)
  groupMatches?: ParticipantMatchDto[];
}
