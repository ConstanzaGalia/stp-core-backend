import { IsString, IsOptional, IsNumber, IsDateString } from 'class-validator';

export class UpdateUserProfileDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  lastName?: string;

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

  @IsDateString()
  @IsOptional()
  dateOfBirth?: string; // Fecha de nacimiento (YYYY-MM-DD)
}

