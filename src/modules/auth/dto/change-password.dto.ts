import { IsNotEmpty, Matches, MinLength } from "class-validator";

export class ChangePasswordDto {
  @IsNotEmpty()
  @MinLength(8)
  @Matches(/^(?=.*?[A-Z])(?=.*?[a-z])(?=.*?[0-9])(?=.*?[^\w\s]).{8,}$/, {message: 'Password too weak'})
  oldPassword: string;

  @IsNotEmpty()
  @MinLength(8)
  @Matches(/^(?=.*?[A-Z])(?=.*?[a-z])(?=.*?[0-9])(?=.*?[^\w\s]).{8,}$/, {message: 'Password too weak'})
  newPassword: string;
}