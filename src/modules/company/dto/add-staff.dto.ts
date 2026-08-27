import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { UserRole } from 'src/common/enums/enums';

const STAFF_ROLES = [
  UserRole.TRAINER,
  UserRole.SUB_TRAINER,
  UserRole.DIRECTOR,
  UserRole.SECRETARIA,
];

export class AddStaffDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsString()
  lastName: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsIn(STAFF_ROLES, {
    message: `role debe ser uno de: ${STAFF_ROLES.join(', ')}`,
  })
  role: UserRole.TRAINER | UserRole.SUB_TRAINER | UserRole.DIRECTOR | UserRole.SECRETARIA;

  @IsOptional()
  @IsString()
  specialty?: string;

  @IsOptional()
  @IsString()
  experience?: string;

  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  password?: string;
}
