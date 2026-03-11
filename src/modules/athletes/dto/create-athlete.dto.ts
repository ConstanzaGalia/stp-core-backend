import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class CreateAthleteDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsString()
  lastName: string;

  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsOptional()
  @IsBoolean()
  isOnline?: boolean;

  /** Fecha de nacimiento en formato YYYY-MM-DD */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateOfBirth debe ser YYYY-MM-DD' })
  dateOfBirth?: string;
}
