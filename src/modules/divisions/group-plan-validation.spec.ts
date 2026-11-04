import { BadRequestException } from '@nestjs/common';
import { validateGroupPlanInput } from './group-plan-validation';

const roster = new Set(['a', 'b', 'c']);
const base = { criteria: {} };

describe('validateGroupPlanInput', () => {
  it('acepta grupos válidos y sin asignar', () => {
    const out = validateGroupPlanInput(
      {
        ...base,
        groups: [{ id: 'g1', name: ' Fuertes ', athleteIds: ['a', 'b'] }],
        unassigned: ['c'],
      },
      roster,
    );
    expect(out.groups[0]).toEqual({
      id: 'g1',
      name: 'Fuertes',
      athleteIds: ['a', 'b'],
    });
    expect(out.unassigned).toEqual(['c']);
  });

  it('rechaza atletas de otra división', () => {
    expect(() =>
      validateGroupPlanInput(
        {
          ...base,
          groups: [{ id: 'g1', name: 'X', athleteIds: ['zzz'] }],
          unassigned: [],
        },
        roster,
      ),
    ).toThrow(BadRequestException);
  });

  it('rechaza un atleta repetido entre grupos y sin asignar', () => {
    expect(() =>
      validateGroupPlanInput(
        {
          ...base,
          groups: [{ id: 'g1', name: 'X', athleteIds: ['a'] }],
          unassigned: ['a'],
        },
        roster,
      ),
    ).toThrow(BadRequestException);
  });

  it('rechaza ids de grupo repetidos y nombres vacíos', () => {
    expect(() =>
      validateGroupPlanInput(
        {
          ...base,
          groups: [
            { id: 'g1', name: 'X', athleteIds: [] },
            { id: 'g1', name: 'Y', athleteIds: [] },
          ],
          unassigned: [],
        },
        roster,
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      validateGroupPlanInput(
        {
          ...base,
          groups: [{ id: 'g1', name: '  ', athleteIds: [] }],
          unassigned: [],
        },
        roster,
      ),
    ).toThrow(BadRequestException);
  });

  it('limita la cantidad de grupos', () => {
    const groups = Array.from({ length: 21 }, (_, i) => ({
      id: `g${i}`,
      name: `G${i}`,
      athleteIds: [],
    }));
    expect(() =>
      validateGroupPlanInput({ ...base, groups, unassigned: [] }, roster),
    ).toThrow(BadRequestException);
  });
});
