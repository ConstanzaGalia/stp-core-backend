import { IsEmail, IsEnum, IsNotEmpty, IsString, Matches, MinLength } from "class-validator";
import { UserRole } from "src/common/enums/enums";

export class RegisterUserDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsString()
  lastName: string;

  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @IsEnum(UserRole)
  role: UserRole;

  @IsNotEmpty()
  @MinLength(8)
  @Matches(/^(?=.*?[A-Z])(?=.*?[a-z])(?=.*?[0-9])(?=.*?[^\w\s]).{8,}$/, {message: 'Password too weak'})
  password: string;
}