import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { User } from 'src/entities/user.entity';
import { UserRole } from 'src/common/enums/enums';

export function assertStpAdmin(user: User | undefined): void {
  if (!user) {
    throw new UnauthorizedException();
  }
  if (user.role !== UserRole.STP_ADMIN) {
    throw new ForbiddenException('Only STP_ADMIN can perform this action');
  }
}

export function isStpAdmin(user: User | undefined): boolean {
  return user?.role === UserRole.STP_ADMIN;
}

export function hasDirectorPrivileges(role: UserRole | string | undefined): boolean {
  return role === UserRole.DIRECTOR || role === UserRole.STP_ADMIN;
}

export function isCompanyDirectorOrAdmin(
  user: User,
  companyUsers: User[] | undefined,
  userId: string,
): boolean {
  if (user.role === UserRole.STP_ADMIN) {
    return true;
  }
  return (companyUsers ?? []).some(
    u =>
      u.id === userId &&
      (u.role === UserRole.DIRECTOR || u.role === UserRole.STP_ADMIN),
  );
}
