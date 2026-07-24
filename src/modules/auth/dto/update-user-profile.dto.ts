import { IsString, IsOptional, IsDateString, IsEmail } from 'class-validator';

export class UpdateUserProfileDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsEmail({}, { message: 'Email inválido' })
  @IsOptional()
  email?: string;

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
