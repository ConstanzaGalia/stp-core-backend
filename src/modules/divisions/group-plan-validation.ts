import { BadRequestException } from '@nestjs/common';
import type { GroupPlanGroup } from '../../entities/division-group-plan.entity';

export const GROUP_PLAN_MAX_GROUPS = 20;
export const GROUP_PLAN_MAX_CRITERIA_BYTES = 20_000;

export type ValidatedGroupPlanInput = {
  groups: GroupPlanGroup[];
  unassigned: string[];
};

/**
 * Valida la forma de los grupos y que cada atleta pertenezca a la división
 * y aparezca una sola vez (en un grupo o en "sin asignar").
 */
export function validateGroupPlanInput(
  input: {
    groups: unknown[];
    unassigned: unknown[];
    criteria: Record<string, unknown>;
  },
  rosterIds: ReadonlySet<string>,
): ValidatedGroupPlanInput {
  if (
    JSON.stringify(input.criteria ?? {}).length > GROUP_PLAN_MAX_CRITERIA_BYTES
  ) {
    throw new BadRequestException(
      'La configuración del armado es demasiado grande',
    );
  }
  if (input.groups.length > GROUP_PLAN_MAX_GROUPS) {
    throw new BadRequestException(
      `Máximo ${GROUP_PLAN_MAX_GROUPS} grupos por armado`,
    );
  }

  const seen = new Set<string>();
  const takeAthlete = (value: unknown): string => {
    if (typeof value !== 'string' || !rosterIds.has(value)) {
      throw new BadRequestException(
        'Hay atletas que no pertenecen a esta división',
      );
    }
    if (seen.has(value)) {
      throw new BadRequestException(
        'Un atleta no puede estar en dos grupos a la vez',
      );
    }
    seen.add(value);
    return value;
  };

  const groupIds = new Set<string>();
  const groups = input.groups.map((raw): GroupPlanGroup => {
    const g = raw as Partial<GroupPlanGroup> | null;
    const id = typeof g?.id === 'string' ? g.id.trim() : '';
    const name = typeof g?.name === 'string' ? g.name.trim() : '';
    if (!id || id.length > 64 || groupIds.has(id)) {
      throw new BadRequestException(
        'Identificador de grupo inválido o repetido',
      );
    }
    if (!name || name.length > 80) {
      throw new BadRequestException(
        'Cada grupo necesita un nombre de hasta 80 caracteres',
      );
    }
    if (!Array.isArray(g?.athleteIds)) {
      throw new BadRequestException('Grupo sin lista de atletas');
    }
    groupIds.add(id);
    return { id, name, athleteIds: g.athleteIds.map(takeAthlete) };
  });

  const unassigned = input.unassigned.map(takeAthlete);
  return { groups, unassigned };
}
