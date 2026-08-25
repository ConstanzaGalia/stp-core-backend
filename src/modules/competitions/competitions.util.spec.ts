import {
  Competition,
  CompetitionDateType,
  CompetitionStatus,
} from '../../entities/competition.entity';
import {
  buildCompetitionObjectiveDescription,
  formatParticipantMatchLine,
} from './competitions.util';

function baseCompetition(overrides: Partial<Competition> = {}): Competition {
  return {
    id: 'comp-1',
    companyId: 'company-1',
    name: 'Torneo Regional',
    sport: 'Tenis',
    dateType: CompetitionDateType.SINGLE_DATE,
    targetDate: new Date('2026-03-01'),
    startDate: null,
    endDate: null,
    location: 'Club Central',
    description: 'Torneo de primavera',
    status: CompetitionStatus.COMPLETED,
    resultSummary: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Competition;
}

describe('buildCompetitionObjectiveDescription', () => {
  it('incluye solo resultado grupal cuando no hay individual', () => {
    const competition = baseCompetition({ resultSummary: 'Campeón liga' });
    const description = buildCompetitionObjectiveDescription(competition);
    expect(description).toContain('Resultado: Campeón liga');
    expect(description).not.toContain('Resultado del equipo');
    expect(description).not.toContain('Resultado personal');
  });

  it('incluye solo resultado individual cuando no hay grupal', () => {
    const competition = baseCompetition({ resultSummary: null });
    const description = buildCompetitionObjectiveDescription(competition, 'Semifinalista');
    expect(description).toContain('Resultado: Semifinalista');
    expect(description).not.toContain('Resultado personal');
  });

  it('incluye ambos resultados con prefijos distintos', () => {
    const competition = baseCompetition({ resultSummary: 'Campeón liga' });
    const description = buildCompetitionObjectiveDescription(competition, 'Subcampeón singles');
    expect(description).toContain('Resultado del equipo: Campeón liga');
    expect(description).toContain('Resultado personal: Subcampeón singles');
  });

  it('incluye partidos cuando la competencia está en curso', () => {
    const competition = baseCompetition({ status: CompetitionStatus.IN_PROGRESS });
    const description = buildCompetitionObjectiveDescription(competition, null, [
      {
        playedAt: '2026-03-10',
        roundLabel: 'Semifinal',
        opponent: 'López',
        resultSummary: '6-4 6-2',
      },
    ]);
    expect(description).toContain('Partidos personales:');
    expect(description).toContain('6-4 6-2');
    expect(description).toContain('Semifinal');
  });

  it('no incluye resultados si la competencia no está finalizada ni en curso', () => {
    const competition = baseCompetition({
      status: CompetitionStatus.PLANNED,
      resultSummary: 'Campeón liga',
    });
    const description = buildCompetitionObjectiveDescription(competition, 'Semifinalista');
    expect(description).not.toContain('Resultado');
    expect(description).not.toContain('Partidos');
  });

  it('marca cancelada sin resultados', () => {
    const competition = baseCompetition({
      status: CompetitionStatus.CANCELLED,
      resultSummary: 'Campeón liga',
    });
    const description = buildCompetitionObjectiveDescription(competition, 'Semifinalista');
    expect(description).toContain('Estado: cancelada');
    expect(description).not.toContain('Resultado');
  });
});

describe('formatParticipantMatchLine', () => {
  it('formatea fecha, instancia y rival', () => {
    const line = formatParticipantMatchLine({
      playedAt: '2026-03-10',
      roundLabel: 'Semifinal',
      opponent: 'López',
      resultSummary: '6-4 6-2',
    });
    expect(line).toContain('10/03/2026');
    expect(line).toContain('Semifinal');
    expect(line).toContain('vs López');
    expect(line).toContain('6-4 6-2');
  });
});
