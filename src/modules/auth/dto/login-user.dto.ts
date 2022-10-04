import { IsEmail, IsNotEmpty, Matches, MinLength } from "class-validator";

export class LoginUserDto {
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @MinLength(8)
  @Matches(/^(?=.*?[A-Z])(?=.*?[a-z])(?=.*?[0-9])(?=.*?[^\w\s]).{8,}$/, {message: 'Password too weak'})
  password: string;
}