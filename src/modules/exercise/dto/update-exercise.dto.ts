import { OmitType, PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, ValidateIf } from 'class-validator';
import { CreateExerciseDto } from './create-exercise.dto';
import { IsYouTubeVideoUrl } from '../youtube-url';

export class UpdateExerciseDto extends PartialType(
  OmitType(CreateExerciseDto, ['video'] as const),
) {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_, value) => value != null && String(value).trim() !== '')
  @IsString()
  @IsYouTubeVideoUrl()
  video?: string;
}
