import { IsString, IsEmail } from 'class-validator';

export class JoinCompanyDto {
  @IsEmail()
  trainerEmail: string;

  @IsString()
  trainerPassword: string;
} 