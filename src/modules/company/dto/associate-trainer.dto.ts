import { IsString, IsEmail, IsOptional } from 'class-validator';

export class AssociateTrainerDto {
  @IsEmail()
  trainerEmail: string;

  @IsString()
  @IsOptional()
  trainerName?: string;

  @IsString()
  @IsOptional()
  trainerLastName?: string;
} 