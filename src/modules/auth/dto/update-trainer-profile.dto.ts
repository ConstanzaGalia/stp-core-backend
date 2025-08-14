import { IsString, IsOptional, IsNumber, Min, Max } from 'class-validator';

export class UpdateTrainerProfileDto {
  @IsString()
  @IsOptional()
  specialty?: string;

  @IsString()
  @IsOptional()
  biography?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(50)
  experienceYears?: number;

  @IsString()
  @IsOptional()
  phoneNumber?: string;

  @IsString()
  @IsOptional()
  country?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  imageProfile?: string;
} 