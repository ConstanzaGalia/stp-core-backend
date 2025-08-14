import { IsEnum, IsOptional, IsString } from 'class-validator';
import { UserRole } from 'src/common/enums/enums';

export class UpdateUserRoleDto {
  @IsEnum(UserRole)
  role: UserRole;

  @IsString()
  @IsOptional()
  reason?: string; // Opcional: razón del cambio de rol
} 