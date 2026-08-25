import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import {
  Competition,
  CompetitionDateType,
  CompetitionStatus,
} from '../../entities/competition.entity';
import { CompetitionDivision } from '../../entities/competition-division.entity';
import { CompetitionParticipant } from '../../entities/competition-participant.entity';
import { CompetitionParticipantMatch } from '../../entities/competition-participant-match.entity';
import { CompetitionMatch } from '../../entities/competition-match.entity';
import {
  AthleteObjective,
} from '../../entities/athlete-objective.entity';
import { Company } from '../../entities/company.entity';
import { Division } from '../../entities/division.entity';
import { User } from '../../entities/user.entity';
import {
  AthleteInvitation,
  InvitationStatus,
} from '../../entities/athlete-invitation.entity';
import { UserRole, CompanyAccountType } from '../../common/enums/enums';
import {
  isCoachScopedRole,
  resolveCoachDivisionScope,
} from '../../common/helpers/division-scope.helper';
import {
  CreateCompetitionDto,
  UpdateCompetitionDto,
  UpdateCompetitionResultDto,
  ParticipantResultDto,
  ParticipantMatchDto,
} from './dto/competition.dto';
import {
  buildCompetitionObjectivePayload,
  parseDateOnly,
  resolveCompetitionDates,
  type CompetitionMatchSummary,
} from './competitions.util';

const STAFF_VIEW_ROLES: UserRole[] = [
  UserRole.STP_ADMIN,
  UserRole.DIRECTOR,
  UserRole.TRAINER,
  UserRole.SUB_TRAINER,
  UserRole.SECRETARIA,
];

export type CompetitionDivisionSummary = {
  id: string;
  name: string;
};

export type CompetitionParticipantMatchSummary = CompetitionMatchSummary;

export type CompetitionParticipantSummary = {
  userId: string;
  name: string;
  lastName: string;
  email: string;
  dateOfBirth: string | null;
  dni: string | null;
  divisionId: string | null;
  divisionName: string | null;
  resultSummary: string | null;
  matches: CompetitionParticipantMatchSummary[];
};

export type CompetitionListItem = {
  id: string;
  companyId: string;
  name: string;
  sport: string;
  dateType: CompetitionDateType;
  targetDate: string | null;
  startDate: string | null;
  endDate: string | null;
  location: string | null;
  description: string | null;
  status: CompetitionStatus;
  resultSummary: string | null;
  participantCount: number;
  divisions: CompetitionDivisionSummary[];
  createdAt: string;
  updatedAt: string;
};

export type CompetitionDetail = CompetitionListItem & {
  participants: CompetitionParticipantSummary[];
  groupMatches: CompetitionMatchSummary[];
};

export type AvailableAthlete = {
  userId: string;
  name: string;
  lastName: string;
  email: string;
  divisionId: string | null;
  divisionName: string | null;
};

@Injectable()
export class CompetitionsService {
  constructor(
    @InjectRepository(Competition)
    private readonly competitionRepo: Repository<Competition>,
    @InjectRepository(CompetitionDivision)
    private readonly competitionDivisionRepo: Repository<CompetitionDivision>,
    @InjectRepository(CompetitionParticipant)
    private readonly participantRepo: Repository<CompetitionParticipant>,
    @InjectRepository(AthleteObjective)
    private readonly objectiveRepo: Repository<AthleteObjective>,
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    @InjectRepository(Division)
    private readonly divisionRepo: Repository<Division>,
    @InjectRepository(AthleteInvitation)
    private readonly invitationRepo: Repository<AthleteInvitation>,
    private readonly dataSource: DataSource,
  ) {}

  private async assertSportsClub(companyId: string): Promise<Company> {
    const company = await this.companyRepo.findOne({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Centro no encontrado');
    if (company.accountType !== CompanyAccountType.SPORTS_CLUB) {
      throw new BadRequestException(
        'Las competencias solo están disponibles para clubes deportivos',
      );
    }
    return company;
  }

  private async assertCanView(actor: User, companyId: string): Promise<Company> {
    const company = await this.assertSportsClub(companyId);

    if (actor.role === UserRole.STP_ADMIN) return company;

    if (!STAFF_VIEW_ROLES.includes(actor.role)) {
      throw new ForbiddenException('Sin permiso');
    }

    const membership = await this.companyRepo
      .createQueryBuilder('c')
      .innerJoin('c.users', 'u', 'u.id = :uid', { uid: actor.id })
      .where('c.id = :cid', { cid: companyId })
      .getOne();

    if (!membership) throw new ForbiddenException('No perteneces a este centro');
    return company;
  }

  private async assertCanManage(actor: User, companyId: string): Promise<Company> {
    const company = await this.assertCanView(actor, companyId);

    if (actor.role === UserRole.STP_ADMIN || actor.role === UserRole.DIRECTOR) {
      return company;
    }

    if (actor.role === UserRole.SECRETARIA) {
      throw new ForbiddenException('La secretaría solo puede consultar competencias');
    }

    if (isCoachScopedRole(actor.role)) {
      throw new ForbiddenException(
        'Como entrenador solo podés actualizar estado y resultado de competencias de tus divisiones',
      );
    }

    throw new ForbiddenException('Sin permiso para gestionar competencias');
  }

  private async getCoachScope(actor: User, companyId: string) {
    return resolveCoachDivisionScope(
      this.companyRepo,
      this.divisionRepo,
      actor,
      companyId,
    );
  }

  private async assertCoachCanAccessCompetition(
    actor: User,
    competitionId: string,
  ): Promise<Competition> {
    const competition = await this.competitionRepo.findOne({
      where: { id: competitionId },
      relations: ['competitionDivisions'],
    });
    if (!competition) throw new NotFoundException('Competencia no encontrada');

    const scope = await this.getCoachScope(actor, competition.companyId);
    if (!scope.scoped) return competition;

    const linkedDivisionIds = competition.competitionDivisions.map((row) => row.divisionId);
    const allowed = linkedDivisionIds.some((id) => scope.divisionIds.includes(id));
    if (!allowed) {
      throw new ForbiddenException('No tenés acceso a esta competencia');
    }
    return competition;
  }

  private resolveCompetitionDates(dto: CreateCompetitionDto | UpdateCompetitionDto) {
    return resolveCompetitionDates(
      dto.dateType,
      dto.targetDate,
      dto.startDate,
      dto.endDate,
    );
  }

  private objectivePayloadFromCompetition(
    competition: Competition,
    participantResultSummary?: string | null,
    participantMatches?: CompetitionMatchSummary[],
    groupMatches?: CompetitionMatchSummary[],
  ) {
    return buildCompetitionObjectivePayload(
      competition,
      participantResultSummary,
      participantMatches,
      groupMatches,
    );
  }

  private mapMatchRows(
    matches: Array<{
      playedAt: Date | null;
      roundLabel: string | null;
      opponent: string | null;
      resultSummary: string;
      sortOrder: number;
      createdAt: Date;
    }>,
  ): CompetitionMatchSummary[] {
    return [...matches]
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime())
      .map((match) => ({
        playedAt: this.formatDateOnly(match.playedAt),
        roundLabel: match.roundLabel,
        opponent: match.opponent,
        resultSummary: match.resultSummary,
      }));
  }

  private mapParticipantMatches(
    matches: CompetitionParticipantMatch[],
  ): CompetitionMatchSummary[] {
    return this.mapMatchRows(matches);
  }

  private formatDateOnly(value: Date | null | undefined): string | null {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(value);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private async validateDivisionIds(companyId: string, divisionIds: string[]) {
    if (divisionIds.length === 0) return;
    const divisions = await this.divisionRepo.find({
      where: { companyId, id: In(divisionIds) },
    });
    if (divisions.length !== divisionIds.length) {
      throw new BadRequestException('Una o más divisiones no pertenecen al club');
    }
  }

  private async validateParticipantUserIds(
    companyId: string,
    participantUserIds: string[],
  ): Promise<Map<string, string | null>> {
    if (participantUserIds.length === 0) return new Map();

    const invitations = await this.invitationRepo.find({
      where: {
        company: { id: companyId },
        status: InvitationStatus.APPROVED,
        user: { id: In(participantUserIds) },
      },
      relations: ['user', 'division'],
    });

    const foundIds = new Set(invitations.map((inv) => inv.user.id));
    const missing = participantUserIds.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(
        'Uno o más jugadores no pertenecen al club o no están aprobados',
      );
    }

    const divisionByUser = new Map<string, string | null>();
    for (const inv of invitations) {
      divisionByUser.set(inv.user.id, inv.divisionId ?? null);
    }
    return divisionByUser;
  }

  private async applyParticipantResults(
    manager: typeof this.dataSource.manager,
    competitionId: string,
    participantResults?: ParticipantResultDto[],
  ) {
    if (!participantResults?.length) return;

    for (const row of participantResults) {
      const participant = await manager.findOne(CompetitionParticipant, {
        where: { competitionId, userId: row.userId },
      });
      if (!participant) continue;

      if (row.resultSummary !== undefined) {
        participant.resultSummary = row.resultSummary?.trim() || null;
        await manager.save(CompetitionParticipant, participant);
      }

      if (row.matches === undefined) continue;

      await manager.delete(CompetitionParticipantMatch, { participantId: participant.id });
      for (let index = 0; index < row.matches.length; index++) {
        const match = row.matches[index];
        if (!match.resultSummary?.trim()) continue;
        await manager.save(
          CompetitionParticipantMatch,
          manager.create(CompetitionParticipantMatch, {
            participantId: participant.id,
            playedAt: match.playedAt ? parseDateOnly(match.playedAt) : null,
            roundLabel: match.roundLabel?.trim() || null,
            opponent: match.opponent?.trim() || null,
            resultSummary: match.resultSummary.trim(),
            sortOrder: index,
          }),
        );
      }
    }
  }

  private async applyGroupMatches(
    manager: typeof this.dataSource.manager,
    competitionId: string,
    groupMatches?: ParticipantMatchDto[],
  ) {
    if (groupMatches === undefined) return;

    await manager.delete(CompetitionMatch, { competitionId });
    for (let index = 0; index < groupMatches.length; index++) {
      const match = groupMatches[index];
      if (!match.resultSummary?.trim()) continue;
      await manager.save(
        CompetitionMatch,
        manager.create(CompetitionMatch, {
          competitionId,
          playedAt: match.playedAt ? parseDateOnly(match.playedAt) : null,
          roundLabel: match.roundLabel?.trim() || null,
          opponent: match.opponent?.trim() || null,
          resultSummary: match.resultSummary.trim(),
          sortOrder: index,
        }),
      );
    }
  }

  private async loadGroupMatches(competitionId: string): Promise<CompetitionMatchSummary[]> {
    const rows = await this.dataSource.getRepository(CompetitionMatch).find({
      where: { competitionId },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
    return this.mapMatchRows(rows);
  }

  private async syncLinkedObjectives(
    manager: typeof this.dataSource.manager,
    competition: Competition,
    participantUserIds: string[],
  ) {
    const participants =
      participantUserIds.length > 0
        ? await manager.find(CompetitionParticipant, {
            where: { competitionId: competition.id, userId: In(participantUserIds) },
            relations: ['matches'],
          })
        : [];

    const groupMatchRows = await manager.find(CompetitionMatch, {
      where: { competitionId: competition.id },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
    const groupMatches = this.mapMatchRows(groupMatchRows);

    for (const userId of participantUserIds) {
      const participant = participants.find((row) => row.userId === userId);
      const payload = this.objectivePayloadFromCompetition(
        competition,
        participant?.resultSummary,
        participant ? this.mapParticipantMatches(participant.matches ?? []) : [],
        groupMatches,
      );

      let objective = await manager.findOne(AthleteObjective, {
        where: { competitionId: competition.id, user: { id: userId } },
        relations: ['user'],
      });

      if (!objective) {
        const user = await manager.findOneBy(User, { id: userId });
        if (!user) continue;
        objective = manager.create(AthleteObjective, {
          user,
          competitionId: competition.id,
          ...payload,
        });
      } else {
        Object.assign(objective, payload);
      }

      await manager.save(AthleteObjective, objective);
    }

    if (participantUserIds.length === 0) {
      await manager.delete(AthleteObjective, { competitionId: competition.id });
      return;
    }

    await manager
      .createQueryBuilder()
      .delete()
      .from(AthleteObjective)
      .where('competition_id = :cid', { cid: competition.id })
      .andWhere('userId NOT IN (:...uids)', { uids: participantUserIds })
      .execute();
  }

  private mapListItem(
    competition: Competition,
    divisions: CompetitionDivisionSummary[],
    participantCount: number,
  ): CompetitionListItem {
    return {
      id: competition.id,
      companyId: competition.companyId,
      name: competition.name,
      sport: competition.sport,
      dateType: competition.dateType,
      targetDate: this.formatDateOnly(competition.targetDate),
      startDate: this.formatDateOnly(competition.startDate),
      endDate: this.formatDateOnly(competition.endDate),
      location: competition.location,
      description: competition.description,
      status: competition.status,
      resultSummary: competition.resultSummary,
      participantCount,
      divisions,
      createdAt: competition.createdAt.toISOString(),
      updatedAt: competition.updatedAt.toISOString(),
    };
  }

  private async loadDivisionSummaries(competitionId: string): Promise<CompetitionDivisionSummary[]> {
    const rows = await this.competitionDivisionRepo.find({
      where: { competitionId },
      relations: ['division'],
      order: { createdAt: 'ASC' },
    });
    return rows.map((row) => ({
      id: row.division.id,
      name: row.division.name,
    }));
  }

  private async loadParticipantSummaries(
    competitionId: string,
  ): Promise<CompetitionParticipantSummary[]> {
    const rows = await this.participantRepo.find({
      where: { competitionId },
      relations: ['user', 'division', 'matches'],
      order: { createdAt: 'ASC' },
    });
    return rows.map((row) => ({
      userId: row.userId,
      name: row.user.name,
      lastName: row.user.lastName,
      email: row.user.email,
      dateOfBirth: this.formatDateOnly(row.user.dateOfBirth),
      dni: row.user.dni?.trim() || null,
      divisionId: row.divisionId,
      divisionName: row.division?.name ?? null,
      resultSummary: row.resultSummary,
      matches: this.mapParticipantMatches(row.matches ?? []),
    }));
  }

  async listByCompany(
    actor: User,
    companyId: string,
    filters?: {
      status?: CompetitionStatus;
      sport?: string;
      divisionId?: string;
    },
  ): Promise<CompetitionListItem[]> {
    await this.assertCanView(actor, companyId);
    const scope = await this.getCoachScope(actor, companyId);

    const qb = this.competitionRepo
      .createQueryBuilder('c')
      .where('c.company_id = :companyId', { companyId })
      .orderBy('c.target_date', 'ASC', 'NULLS LAST')
      .addOrderBy('c.start_date', 'ASC', 'NULLS LAST')
      .addOrderBy('c.created_at', 'DESC');

    if (filters?.status) {
      qb.andWhere('c.status = :status', { status: filters.status });
    }
    if (filters?.sport?.trim()) {
      qb.andWhere('LOWER(c.sport) = LOWER(:sport)', { sport: filters.sport.trim() });
    }
    if (filters?.divisionId) {
      qb.innerJoin('c.competitionDivisions', 'cd', 'cd.division_id = :divisionId', {
        divisionId: filters.divisionId,
      });
    }

    let competitions = await qb.getMany();

    if (scope.scoped) {
      if (scope.divisionIds.length === 0) return [];
      const scopedIds = new Set<string>();
      const divisionLinks = await this.competitionDivisionRepo.find({
        where: { divisionId: In(scope.divisionIds) },
      });
      divisionLinks.forEach((row) => scopedIds.add(row.competitionId));
      competitions = competitions.filter((c) => scopedIds.has(c.id));
    }

    const result: CompetitionListItem[] = [];
    for (const competition of competitions) {
      const divisions = await this.loadDivisionSummaries(competition.id);
      const participantCount = await this.participantRepo.count({
        where: { competitionId: competition.id },
      });
      result.push(this.mapListItem(competition, divisions, participantCount));
    }
    return result;
  }

  async getAvailableAthletes(
    actor: User,
    companyId: string,
    divisionIds?: string[],
  ): Promise<AvailableAthlete[]> {
    await this.assertCanView(actor, companyId);
    const scope = await this.getCoachScope(actor, companyId);

    let effectiveDivisionIds = divisionIds?.filter(Boolean) ?? [];
    if (scope.scoped) {
      if (scope.divisionIds.length === 0) return [];
      effectiveDivisionIds =
        effectiveDivisionIds.length > 0
          ? effectiveDivisionIds.filter((id) => scope.divisionIds.includes(id))
          : scope.divisionIds;
    }

    const qb = this.invitationRepo
      .createQueryBuilder('inv')
      .innerJoinAndSelect('inv.user', 'user')
      .leftJoinAndSelect('inv.division', 'division')
      .where('inv.companyId = :companyId', { companyId })
      .andWhere('inv.status = :status', { status: InvitationStatus.APPROVED });

    if (effectiveDivisionIds.length > 0) {
      qb.andWhere('inv.division_id IN (:...divisionIds)', {
        divisionIds: effectiveDivisionIds,
      });
    }

    const invitations = await qb.orderBy('user.lastName', 'ASC').addOrderBy('user.name', 'ASC').getMany();

    return invitations.map((inv) => ({
      userId: inv.user.id,
      name: inv.user.name,
      lastName: inv.user.lastName,
      email: inv.user.email,
      divisionId: inv.divisionId,
      divisionName: inv.division?.name ?? null,
    }));
  }

  async getOne(actor: User, competitionId: string): Promise<CompetitionDetail> {
    const competition = await this.competitionRepo.findOne({
      where: { id: competitionId },
    });
    if (!competition) throw new NotFoundException('Competencia no encontrada');

    await this.assertCanView(actor, competition.companyId);

    if (isCoachScopedRole(actor.role)) {
      await this.assertCoachCanAccessCompetition(actor, competitionId);
    }

    const divisions = await this.loadDivisionSummaries(competition.id);
    const participants = await this.loadParticipantSummaries(competition.id);
    const groupMatches = await this.loadGroupMatches(competition.id);
    return {
      ...this.mapListItem(competition, divisions, participants.length),
      participants,
      groupMatches,
    };
  }

  async create(
    actor: User,
    companyId: string,
    dto: CreateCompetitionDto,
  ): Promise<CompetitionDetail> {
    await this.assertCanManage(actor, companyId);

    const divisionIds = dto.divisionIds ?? [];
    const participantUserIds = dto.participantUserIds ?? [];
    await this.validateDivisionIds(companyId, divisionIds);
    const divisionByUser = await this.validateParticipantUserIds(
      companyId,
      participantUserIds,
    );

    const dates = this.resolveCompetitionDates(dto);

    const competitionId = await this.dataSource.transaction(async (manager) => {
      const competition = manager.create(Competition, {
        companyId,
        name: dto.name.trim(),
        sport: dto.sport.trim(),
        dateType: dto.dateType,
        ...dates,
        location: dto.location?.trim() || null,
        description: dto.description?.trim() || null,
        status: dto.status ?? CompetitionStatus.PLANNED,
        resultSummary: dto.resultSummary?.trim() || null,
      });
      const saved = await manager.save(Competition, competition);

      for (const divisionId of divisionIds) {
        await manager.save(
          CompetitionDivision,
          manager.create(CompetitionDivision, {
            competitionId: saved.id,
            divisionId,
          }),
        );
      }

      for (const userId of participantUserIds) {
        await manager.save(
          CompetitionParticipant,
          manager.create(CompetitionParticipant, {
            competitionId: saved.id,
            userId,
            divisionId: divisionByUser.get(userId) ?? null,
          }),
        );
      }

      await this.syncLinkedObjectives(manager, saved, participantUserIds);
      return saved.id;
    });
    return this.getOne(actor, competitionId);
  }

  async update(
    actor: User,
    competitionId: string,
    dto: UpdateCompetitionDto,
  ): Promise<CompetitionDetail> {
    const existing = await this.competitionRepo.findOne({ where: { id: competitionId } });
    if (!existing) throw new NotFoundException('Competencia no encontrada');
    await this.assertCanManage(actor, existing.companyId);

    const divisionIds = dto.divisionIds ?? [];
    const participantUserIds = dto.participantUserIds ?? [];
    await this.validateDivisionIds(existing.companyId, divisionIds);
    const divisionByUser = await this.validateParticipantUserIds(
      existing.companyId,
      participantUserIds,
    );
    const dates = this.resolveCompetitionDates(dto);

    const savedId = await this.dataSource.transaction(async (manager) => {
      existing.name = dto.name.trim();
      existing.sport = dto.sport.trim();
      existing.dateType = dto.dateType;
      existing.targetDate = dates.targetDate;
      existing.startDate = dates.startDate;
      existing.endDate = dates.endDate;
      existing.location = dto.location?.trim() || null;
      existing.description = dto.description?.trim() || null;
      if (dto.status !== undefined) existing.status = dto.status;
      if (dto.resultSummary !== undefined) {
        existing.resultSummary = dto.resultSummary?.trim() || null;
      }

      const saved = await manager.save(Competition, existing);

      await manager.delete(CompetitionDivision, { competitionId: saved.id });
      for (const divisionId of divisionIds) {
        await manager.save(
          CompetitionDivision,
          manager.create(CompetitionDivision, {
            competitionId: saved.id,
            divisionId,
          }),
        );
      }

      const existingParticipants = await manager.find(CompetitionParticipant, {
        where: { competitionId: saved.id },
        relations: ['matches'],
      });
      const resultByUser = new Map(
        existingParticipants.map((row) => [row.userId, row.resultSummary]),
      );
      const matchesByUser = new Map(
        existingParticipants.map((row) => [row.userId, row.matches ?? []]),
      );

      await manager.delete(CompetitionParticipant, { competitionId: saved.id });
      for (const userId of participantUserIds) {
        const participant = await manager.save(
          CompetitionParticipant,
          manager.create(CompetitionParticipant, {
            competitionId: saved.id,
            userId,
            divisionId: divisionByUser.get(userId) ?? null,
            resultSummary: resultByUser.get(userId) ?? null,
          }),
        );

        const preservedMatches = matchesByUser.get(userId) ?? [];
        for (let index = 0; index < preservedMatches.length; index++) {
          const match = preservedMatches[index];
          await manager.save(
            CompetitionParticipantMatch,
            manager.create(CompetitionParticipantMatch, {
              participantId: participant.id,
              playedAt: match.playedAt,
              roundLabel: match.roundLabel,
              opponent: match.opponent,
              resultSummary: match.resultSummary,
              sortOrder: index,
            }),
          );
        }
      }

      if (dto.participantResults?.length) {
        await this.applyParticipantResults(manager, saved.id, dto.participantResults);
      }

      if (dto.groupMatches !== undefined) {
        await this.applyGroupMatches(manager, saved.id, dto.groupMatches);
      }

      await this.syncLinkedObjectives(manager, saved, participantUserIds);
      return saved.id;
    });
    return this.getOne(actor, savedId);
  }

  async updateResult(
    actor: User,
    competitionId: string,
    dto: UpdateCompetitionResultDto,
  ): Promise<CompetitionDetail> {
    const existing = await this.competitionRepo.findOne({ where: { id: competitionId } });
    if (!existing) throw new NotFoundException('Competencia no encontrada');

    if (isCoachScopedRole(actor.role)) {
      await this.assertCanView(actor, existing.companyId);
      await this.assertCoachCanAccessCompetition(actor, competitionId);
    } else if (actor.role === UserRole.SECRETARIA) {
      throw new ForbiddenException('La secretaría solo puede consultar competencias');
    } else if (actor.role !== UserRole.STP_ADMIN && actor.role !== UserRole.DIRECTOR) {
      throw new ForbiddenException('Sin permiso para actualizar resultados');
    } else {
      await this.assertCanView(actor, existing.companyId);
    }

    const savedId = await this.dataSource.transaction(async (manager) => {
      existing.status = dto.status;
      existing.resultSummary = dto.resultSummary?.trim() || null;
      const saved = await manager.save(Competition, existing);

      if (dto.participantResults?.length) {
        await this.applyParticipantResults(manager, saved.id, dto.participantResults);
      }

      if (dto.groupMatches !== undefined) {
        await this.applyGroupMatches(manager, saved.id, dto.groupMatches);
      }

      const participants = await manager.find(CompetitionParticipant, {
        where: { competitionId: saved.id },
      });
      await this.syncLinkedObjectives(
        manager,
        saved,
        participants.map((p) => p.userId),
      );
      return saved.id;
    });
    return this.getOne(actor, savedId);
  }

  async remove(actor: User, competitionId: string): Promise<void> {
    const existing = await this.competitionRepo.findOne({ where: { id: competitionId } });
    if (!existing) throw new NotFoundException('Competencia no encontrada');
    await this.assertCanManage(actor, existing.companyId);
    await this.competitionRepo.remove(existing);
  }
}
