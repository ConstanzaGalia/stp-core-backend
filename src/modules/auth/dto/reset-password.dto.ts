import { IsNotEmpty, IsUUID, Matches, MinLength } from "class-validator";

export class ResetPasswordDto {
  @IsNotEmpty()
  @IsUUID('4')
  resetPasswordToken: string;

  @IsNotEmpty()
  @MinLength(8)
  @Matches(/^(?=.*?[A-Z])(?=.*?[a-z])(?=.*?[0-9])(?=.*?[^\w\s]).{8,}$/, {message: 'Password too weak'})
  password: string;
}