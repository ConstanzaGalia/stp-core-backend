import { Repository } from 'typeorm';
import { User } from '../../entities/user.entity';
import { Company } from '../../entities/company.entity';
import { Division } from '../../entities/division.entity';
import { CompanyAccountType, UserRole } from '../enums/enums';

export type CoachDivisionScope = {
  scoped: boolean;
  divisionIds: string[];
};

export function isCoachScopedRole(role: UserRole): boolean {
  return role === UserRole.TRAINER || role === UserRole.SUB_TRAINER;
}

export async function resolveCoachDivisionScope(
  companyRepository: Repository<Company>,
  divisionRepository: Repository<Division>,
  actor: User | undefined,
  companyId: string,
): Promise<CoachDivisionScope> {
  if (!actor || !isCoachScopedRole(actor.role)) {
    return { scoped: false, divisionIds: [] };
  }

  const company = await companyRepository.findOne({ where: { id: companyId } });
  if (company?.accountType !== CompanyAccountType.SPORTS_CLUB) {
    return { scoped: false, divisionIds: [] };
  }

  const divisions = await divisionRepository
    .createQueryBuilder('d')
    .innerJoin('d.coaches', 'c', 'c.id = :uid', { uid: actor.id })
    .where('d.company_id = :cid', { cid: companyId })
    .select(['d.id'])
    .getMany();

  return { scoped: true, divisionIds: divisions.map((d) => d.id) };
}
