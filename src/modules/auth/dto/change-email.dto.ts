import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ChangeEmailDto {
  @IsNotEmpty()
  @IsEmail({}, { message: 'Email inválido' })
  newEmail: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(1)
  password: string;
}
