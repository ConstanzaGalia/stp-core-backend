import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

export class LinkAthleteByEmailDto {
  @Transform(({ value }) => String(value ?? '').trim().toLowerCase())
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsOptional()
  @IsUUID()
  homeBranchId?: string;
}
