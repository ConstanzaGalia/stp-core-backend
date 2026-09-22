import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { User } from 'src/entities/user.entity';
import { Company } from 'src/entities/company.entity';
import { UserRole } from 'src/common/enums/enums';
import { getStpOperatingCompanyId } from 'src/common/constants/stp-operating-company';

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

/**
 * STP_ADMIN o DIRECTOR del centro operativo STP (plataforma).
 * Usado para Centros plataforma y cobros B2B.
 */
export async function assertStpPlatformOperator(
  user: User | undefined,
  companyRepo: Repository<Company>,
): Promise<void> {
  if (!user) {
    throw new UnauthorizedException();
  }
  if (user.role === UserRole.STP_ADMIN) {
    return;
  }
  if (user.role !== UserRole.DIRECTOR) {
    throw new ForbiddenException(
      'Solo STP_ADMIN o directores del centro STP Plataforma pueden realizar esta acción',
    );
  }
  const operatingId = getStpOperatingCompanyId();
  const count = await companyRepo
    .createQueryBuilder('c')
    .innerJoin('c.users', 'u', 'u.id = :uid', { uid: user.id })
    .where('c.id = :operatingId', { operatingId })
    .getCount();
  if (!count) {
    throw new ForbiddenException(
      'Solo directores del centro STP Plataforma pueden realizar esta acción',
    );
  }
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
    (u) =>
      u.id === userId &&
      (u.role === UserRole.DIRECTOR || u.role === UserRole.STP_ADMIN),
  );
}
