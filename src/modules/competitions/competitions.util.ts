import { BadRequestException } from '@nestjs/common';
import {
  Competition,
  CompetitionDateType,
  CompetitionStatus,
} from '../../entities/competition.entity';
import { AthleteObjectiveType } from '../../entities/athlete-objective.entity';

export type CompetitionMatchSummary = {
  playedAt: string | null;
  roundLabel: string | null;
  opponent: string | null;
  resultSummary: string;
};

function formatDateOnly(value: Date | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatParticipantMatchLine(match: CompetitionMatchSummary): string {
  const parts: string[] = [];
  if (match.playedAt) {
    const [year, month, day] = match.playedAt.split('-');
    parts.push(`${day}/${month}/${year}`);
  }
  if (match.roundLabel?.trim()) parts.push(match.roundLabel.trim());
  if (match.opponent?.trim()) parts.push(`vs ${match.opponent.trim()}`);
  const prefix = parts.length > 0 ? `[${parts.join(' · ')}] ` : '';
  return `${prefix}${match.resultSummary.trim()}`;
}

export function buildCompetitionObjectiveDescription(
  competition: Competition,
  participantResultSummary?: string | null,
  participantMatches?: CompetitionMatchSummary[],
  groupMatches?: CompetitionMatchSummary[],
): string | null {
  const parts: string[] = [];
  if (competition.description?.trim()) parts.push(competition.description.trim());
  if (competition.location?.trim()) parts.push(`Sede: ${competition.location.trim()}`);
  if (competition.sport?.trim()) parts.push(`Deporte: ${competition.sport.trim()}`);

  const showResults =
    competition.status === CompetitionStatus.COMPLETED ||
    competition.status === CompetitionStatus.IN_PROGRESS;

  if (showResults) {
    const groupResult = competition.resultSummary?.trim() || null;
    const individualResult = participantResultSummary?.trim() || null;
    const individualMatches = (participantMatches ?? []).filter((m) => m.resultSummary?.trim());
    const teamMatches = (groupMatches ?? []).filter((m) => m.resultSummary?.trim());

    if (groupResult && individualResult) {
      parts.push(`Resultado del equipo: ${groupResult}`);
      parts.push(`Resultado personal: ${individualResult}`);
    } else if (groupResult) {
      parts.push(`Resultado: ${groupResult}`);
    } else if (individualResult) {
      parts.push(`Resultado: ${individualResult}`);
    }

    if (teamMatches.length > 0) {
      parts.push('Partidos del equipo:');
      for (const match of teamMatches) {
        parts.push(`- ${formatParticipantMatchLine(match)}`);
      }
    }

    if (individualMatches.length > 0) {
      parts.push('Partidos personales:');
      for (const match of individualMatches) {
        parts.push(`- ${formatParticipantMatchLine(match)}`);
      }
    }
  }

  if (competition.status === CompetitionStatus.CANCELLED) {
    parts.push('Estado: cancelada');
  }
  return parts.length > 0 ? parts.join('\n') : null;
}

export function buildCompetitionObjectivePayload(
  competition: Competition,
  participantResultSummary?: string | null,
  participantMatches?: CompetitionMatchSummary[],
  groupMatches?: CompetitionMatchSummary[],
) {
  return {
    title: competition.name.trim(),
    description: buildCompetitionObjectiveDescription(
      competition,
      participantResultSummary,
      participantMatches,
      groupMatches,
    ),
    type:
      competition.dateType === CompetitionDateType.SINGLE_DATE
        ? AthleteObjectiveType.SINGLE_DATE
        : AthleteObjectiveType.DATE_RANGE,
    targetDate: competition.targetDate,
    startDate: competition.startDate,
    endDate: competition.endDate,
  };
}

export function resolveCompetitionDates(
  dateType: CompetitionDateType,
  targetDate?: string,
  startDate?: string,
  endDate?: string,
): Pick<Competition, 'targetDate' | 'startDate' | 'endDate'> {
  if (dateType === CompetitionDateType.SINGLE_DATE) {
    if (!targetDate) {
      throw new BadRequestException('targetDate es requerida para fecha puntual');
    }
    return {
      targetDate: parseDateOnly(targetDate),
      startDate: null,
      endDate: null,
    };
  }

  if (!startDate || !endDate) {
    throw new BadRequestException('startDate y endDate son requeridas para rango');
  }
  if (startDate > endDate) {
    throw new BadRequestException('startDate debe ser anterior o igual a endDate');
  }
  return {
    targetDate: null,
    startDate: parseDateOnly(startDate),
    endDate: parseDateOnly(endDate),
  };
}

export function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export { formatDateOnly as formatCompetitionDateOnly };
