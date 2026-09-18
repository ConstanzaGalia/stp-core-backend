import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { In, Repository, MoreThanOrEqual } from 'typeorm';
import { UserRole } from 'src/common/enums/enums';
import { STPTrainingProfile } from 'src/entities/stp-training-profile.entity';
import { STPMacroPlan } from 'src/entities/stp-macro-plan.entity';
import { STPWeeklyTemplate } from 'src/entities/stp-weekly-template.entity';
import { STPSessionInstance } from 'src/entities/stp-session-instance.entity';
import { STPWorkoutTemplate } from 'src/entities/stp-workout-template.entity';
import { STPWorkoutCollection } from 'src/entities/stp-workout-collection.entity';
import { Exercise } from 'src/entities/excercise.entity';
import { User } from 'src/entities/user.entity';
import {
  AthleteInvitation,
  InvitationStatus,
} from 'src/entities/athlete-invitation.entity';
import { Reservation } from 'src/entities/reservation.entity';
import { TimeSlot } from 'src/entities/timeSlot.entity';
import { calendarDateInArgentina, toDateOnlyKey } from 'src/common/utils/date-only.util';
import { resolveCoachDivisionScope } from 'src/common/helpers/division-scope.helper';
import { Company } from 'src/entities/company.entity';
import { Division } from 'src/entities/division.entity';
import { SubscriptionSuspension } from 'src/entities/subscription-suspension.entity';
import {
  buildTrainingInactivityGroups,
  collectSuspendedAthleteIds,
} from './training-inactivity.util';
import { CompanyService } from '../company/company.service';
import { AthletesService } from '../athletes/athletes.service';
import { InjuriesService } from '../injuries/injuries.service';
import {
  buildSafetyConflictWarnings,
  collectExerciseIdsFromBlocks as collectSafetyExerciseIds,
  detectSafetyConflicts,
  mergeSessionWarnings,
  type SafetyConflict,
} from './session-safety.util';
import {
  CreateWorkoutTemplateDto,
  InstantiateWorkoutTemplateDto,
  UpdateWorkoutTemplateDto,
  CreateWorkoutCollectionDto,
  UpdateWorkoutCollectionDto,
} from './dto/workout-template.dto';interface SessionExerciseMeta {
  videoUrl: string | null;
  esIsometrico: boolean;
  unilateral: boolean;
  movementPattern: string | null;
  primaryCategory: string | null;
}

interface FeedbackExercisePayload {
  sessionExerciseId: string;
  actualReps?: number | null;
  actualLoad?: number | null;
  rpe?: number | null;
  pain?: boolean;
  comments?: string;
}

type FeedbackMergeMode = 'draft' | 'block' | 'final';

interface MergeFeedbackInput {
  athleteId: string;
  mode: FeedbackMergeMode;
  source?: 'athlete' | 'trainer';
  submittedBy?: string;
  blockId?: string;
  comments?: string;
  exercises: FeedbackExercisePayload[];
}

function toIso(d: Date | string | null | undefined): string {
  if (!d) return new Date().toISOString();
  return d instanceof Date ? d.toISOString() : d;
}

function isStaffUser(user: User): boolean {
  return user.role !== UserRole.ATHLETE;
}

function formatStaffDisplayName(user: User): string {
  return `${user.name} ${user.lastName}`.trim();
}

function exerciseFeedbackHasData(fb: {
  actualReps?: number | null;
  actualLoad?: number | null;
  rpe?: number | null;
  pain?: boolean;
  comments?: string | null;
}): boolean {
  return (
    fb.actualReps != null ||
    fb.actualLoad != null ||
    fb.rpe != null ||
    fb.pain === true ||
    (typeof fb.comments === 'string' && fb.comments.trim() !== '')
  );
}

function parsePrescribedRepsAsInt(prescribed: unknown): number | null {
  if (prescribed == null) return null;
  const match = String(prescribed).match(/\d+/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

function computeDecisionFromFeedback(params: {
  prescribedReps: unknown;
  actualReps: number | null;
  rpe: number | null;
  pain: boolean;
}): 'advance' | 'hold' | 'regress' | 'review' {
  const { prescribedReps, actualReps, rpe, pain } = params;
  if (pain) return 'regress';
  const prescribedInt = parsePrescribedRepsAsInt(prescribedReps);
  if (prescribedInt == null) return 'review';
  if (actualReps == null) return 'review';
  if (actualReps < prescribedInt) return 'regress';
  if (rpe == null) return 'review';
  if (rpe <= 8) return 'advance';
  if (rpe <= 9) return 'hold';
  return 'regress';
}

function roundLoad(value: number): number {
  return Math.round(value * 10) / 10;
}

function getSessionRpeSummary(
  blocks: Array<{
    id: string;
    exercises?: Array<{ id: string; actualFeedback?: { rpe?: number | null } | null }>;
  }>,
) {
  const blockRpe: Record<string, number | null> = {};
  let total = 0;
  let count = 0;

  for (const block of blocks) {
    let blockTotal = 0;
    let blockCount = 0;
    for (const exercise of block.exercises ?? []) {
      const rpe = exercise.actualFeedback?.rpe ?? null;
      if (rpe != null) {
        blockTotal += rpe;
        blockCount += 1;
      }
    }
    blockRpe[block.id] = blockCount > 0 ? roundLoad(blockTotal / blockCount) : null;
    if (blockCount > 0) {
      total += blockTotal;
      count += blockCount;
    }
  }

  return {
    blockRpe,
    sessionRpe: count > 0 ? roundLoad(total / count) : null,
  };
}

@Injectable()
export class TrainingPlannerService {
  private readonly logger = new Logger(TrainingPlannerService.name);

  constructor(
    @InjectRepository(STPTrainingProfile)
    private readonly profileRepo: Repository<STPTrainingProfile>,
    @InjectRepository(STPMacroPlan)
    private readonly macroPlanRepo: Repository<STPMacroPlan>,
    @InjectRepository(STPWeeklyTemplate)
    private readonly weeklyTemplateRepo: Repository<STPWeeklyTemplate>,
    @InjectRepository(STPSessionInstance)
    private readonly sessionRepo: Repository<STPSessionInstance>,
    @InjectRepository(STPWorkoutTemplate)
    private readonly workoutTemplateRepo: Repository<STPWorkoutTemplate>,
    @InjectRepository(STPWorkoutCollection)
    private readonly workoutCollectionRepo: Repository<STPWorkoutCollection>,
    @InjectRepository(Exercise)
    private readonly exerciseRepo: Repository<Exercise>,
    @InjectRepository(AthleteInvitation)
    private readonly invitationRepo: Repository<AthleteInvitation>,
    @InjectRepository(Reservation)
    private readonly reservationRepo: Repository<Reservation>,
    @InjectRepository(TimeSlot)
    private readonly timeSlotRepo: Repository<TimeSlot>,
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    @InjectRepository(Division)
    private readonly divisionRepo: Repository<Division>,
    @InjectRepository(SubscriptionSuspension)
    private readonly suspensionRepo: Repository<SubscriptionSuspension>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly companyService: CompanyService,
    private readonly athletesService: AthletesService,
    @Inject(forwardRef(() => InjuriesService))
    private readonly injuriesService: InjuriesService,
  ) {}

  private isStaffRole(role: UserRole): boolean {
    return [
      UserRole.STP_ADMIN,
      UserRole.DIRECTOR,
      UserRole.TRAINER,
      UserRole.SUB_TRAINER,
      UserRole.SECRETARIA,
    ].includes(role);
  }

  /**
   * Valida acceso al atleta de entrenamiento (lectura/escritura).
   * Atleta: solo self lectura. Staff: mismo centro + scope de división.
   */
  async assertCanAccessTrainingAthlete(
    actor: User,
    athleteUserId: string,
    write: boolean,
  ): Promise<User> {
    if (actor.role === UserRole.ATHLETE) {
      if (actor.id !== athleteUserId) {
        throw new ForbiddenException('No puedes ver entrenamientos de otro atleta');
      }
      if (write) {
        throw new ForbiddenException('Los atletas no pueden modificar la planificación');
      }
      const target = await this.userRepo.findOne({ where: { id: athleteUserId } });
      if (!target) throw new NotFoundException('Atleta no encontrado');
      if (target.role !== UserRole.ATHLETE) {
        throw new BadRequestException('El usuario indicado no es un atleta');
      }
      return target;
    }

    if (!this.isStaffRole(actor.role) && actor.role !== UserRole.STP_ADMIN) {
      throw new ForbiddenException('Sin permiso');
    }

    if (actor.role === UserRole.STP_ADMIN) {
      const target = await this.userRepo.findOne({ where: { id: athleteUserId } });
      if (!target) throw new NotFoundException('Atleta no encontrado');
      if (target.role !== UserRole.ATHLETE) {
        throw new BadRequestException('El usuario indicado no es un atleta');
      }
      return target;
    }

    const [target, staffCompanies, subs] = await Promise.all([
      this.userRepo.findOne({ where: { id: athleteUserId } }),
      this.companyService.findCompaniesByUser(actor.id),
      this.athletesService.getMySubscribedCenters(athleteUserId),
    ]);

    if (!target) throw new NotFoundException('Atleta no encontrado');
    if (target.role !== UserRole.ATHLETE) {
      throw new BadRequestException('El usuario indicado no es un atleta');
    }

    const staffIds = new Set(staffCompanies.map((c) => c.id));
    const athleteCompanyIds = subs
      .map((inv) => inv.company?.id)
      .filter(Boolean) as string[];
    const sharedCompanyIds = athleteCompanyIds.filter((id) => staffIds.has(id));
    if (sharedCompanyIds.length === 0) {
      throw new ForbiddenException(
        'No tienes acceso a entrenamientos de este atleta en tu centro',
      );
    }
    await this.athletesService.assertCoachCanAccessAthlete(
      actor,
      athleteUserId,
      sharedCompanyIds,
    );
    return target;
  }

  async assertStaffBelongsToCompany(user: User, companyId: string): Promise<void> {
    if (user.role === UserRole.STP_ADMIN) return;
    if (!this.isStaffRole(user.role)) {
      throw new ForbiddenException('No tienes permiso para esta operación');
    }
    const companies = await this.companyService.findCompaniesByUser(user.id);
    if (!companies.some((c) => c.id === companyId)) {
      throw new ForbiddenException('No perteneces a este centro');
    }
  }
  // ── Training Profile ────────────────────────────────────────────────────────

  async ensureProfile(athleteId: string) {
    const existing = await this.profileRepo.findOne({ where: { athleteId } });
    if (existing) return this.serializeProfile(existing);

    const entity = this.profileRepo.create({
      athleteId,
      weeklyFrequency: 3,
      goal: '',
      targetDate: null,
      trainingMaxScore: 3,
      availableEquipment: [],
      defaultProgressionConfig: null,
    });
    try {
      const saved = await this.profileRepo.save(entity);
      return this.serializeProfile(saved);
    } catch (error) {
      // Carrera: otro request creó el perfil entre el findOne y el save.
      const code =
        error && typeof error === 'object' && 'code' in error
          ? String((error as { code?: string }).code)
          : '';
      if (code === '23505') {
        const raced = await this.profileRepo.findOne({ where: { athleteId } });
        if (raced) return this.serializeProfile(raced);
      }
      throw error;
    }
  }

  async saveProfile(athleteId: string, data: Partial<STPTrainingProfile>) {
    let entity = await this.profileRepo.findOne({ where: { athleteId } });
    if (!entity) {
      entity = this.profileRepo.create({ athleteId });
    }
    Object.assign(entity, {
      weeklyFrequency: data.weeklyFrequency ?? entity.weeklyFrequency,
      goal: data.goal ?? entity.goal,
      targetDate: data.targetDate ?? entity.targetDate,
      trainingMaxScore: data.trainingMaxScore ?? entity.trainingMaxScore,
      availableEquipment: data.availableEquipment ?? entity.availableEquipment,
      defaultProgressionConfig:
        data.defaultProgressionConfig !== undefined
          ? data.defaultProgressionConfig
          : entity.defaultProgressionConfig,
    });
    const saved = await this.profileRepo.save(entity);
    return this.serializeProfile(saved);
  }

  private serializeProfile(e: STPTrainingProfile) {
    return {
      athleteId: e.athleteId,
      weeklyFrequency: e.weeklyFrequency,
      goal: e.goal ?? '',
      targetDate: e.targetDate ?? '',
      trainingMaxScore: e.trainingMaxScore,
      availableEquipment: e.availableEquipment ?? [],
      defaultProgressionConfig: e.defaultProgressionConfig ?? null,
      createdAt: toIso(e.createdAt),
      updatedAt: toIso(e.updatedAt),
    };
  }

  // ── Macro Plan ──────────────────────────────────────────────────────────────

  async getMacroPlan(athleteId: string) {
    const entity = await this.macroPlanRepo.findOne({
      where: { athleteId },
      order: { createdAt: 'DESC' },
    });
    if (!entity) return null;
    return this.serializeMacroPlan(entity);
  }

  async getAllMacroPlans(athleteId: string) {
    const entities = await this.macroPlanRepo.find({
      where: { athleteId },
      order: { createdAt: 'DESC' },
    });
    return entities.map((e) => this.serializeMacroPlan(e));
  }

  async saveMacroPlan(data: {
    id?: string;
    athleteId: string;
    goal?: string;
    targetDate?: string;
    level?: string;
    weeklyFrequency?: number;
    status?: string;
    weeks?: unknown[];
    planMode?: string | null;
  }) {
    let entity: STPMacroPlan | null = null;

    if (data.id) {
      entity = await this.macroPlanRepo.findOne({ where: { id: data.id } });
    }

    if (!entity) {
      entity = this.macroPlanRepo.create({
        id: data.id,
        athleteId: data.athleteId,
      });
    }

    Object.assign(entity, {
      athleteId: data.athleteId,
      goal: data.goal ?? entity.goal ?? '',
      targetDate: data.targetDate ?? entity.targetDate ?? null,
      level: data.level ?? entity.level ?? '',
      weeklyFrequency: data.weeklyFrequency ?? entity.weeklyFrequency ?? 3,
      status: data.status ?? entity.status ?? 'draft',
      weeks: data.weeks ?? entity.weeks ?? [],
      planMode: data.planMode !== undefined ? data.planMode : entity.planMode ?? null,
    });
    if (!entity.id) {
      entity.id = data.id as string;
    }

    const saved = await this.macroPlanRepo.save(entity);
    return this.serializeMacroPlan(saved);
  }

  async updateMacroPlanWeeks(id: string, data: { weeks?: unknown[]; status?: string }) {
    const entity = await this.macroPlanRepo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException(`Macro plan ${id} no encontrado`);
    if (data.weeks !== undefined) entity.weeks = data.weeks;
    if (data.status !== undefined) entity.status = data.status;
    const saved = await this.macroPlanRepo.save(entity);
    return this.serializeMacroPlan(saved);
  }

  private serializeMacroPlan(e: STPMacroPlan) {
    return {
      id: e.id,
      athleteId: e.athleteId,
      goal: e.goal ?? '',
      targetDate: e.targetDate ?? '',
      level: e.level ?? '',
      weeklyFrequency: e.weeklyFrequency,
      status: e.status,
      planMode: e.planMode ?? null,
      weeks: e.weeks ?? [],
      createdAt: toIso(e.createdAt),
      updatedAt: toIso(e.updatedAt),
    };
  }

  // ── Weekly Template ─────────────────────────────────────────────────────────

  async getWeeklyTemplate(
    athleteId: string,
    phase: string,
    weekType: string,
    weeklyFrequency: number,
  ) {
    const entity = await this.weeklyTemplateRepo.findOne({
      where: { athleteId, phase, weekType, weeklyFrequency },
    });
    if (!entity) return null;
    return this.serializeWeeklyTemplate(entity);
  }

  async saveWeeklyTemplate(data: {
    id: string;
    athleteId: string;
    phase: string;
    weekType: string;
    weeklyFrequency: number;
    days: unknown[];
  }) {
    let entity = await this.weeklyTemplateRepo.findOne({
      where: {
        athleteId: data.athleteId,
        phase: data.phase,
        weekType: data.weekType,
        weeklyFrequency: data.weeklyFrequency,
      },
    });

    if (!entity) {
      entity = this.weeklyTemplateRepo.create({
        id: data.id,
        athleteId: data.athleteId,
        phase: data.phase,
        weekType: data.weekType,
        weeklyFrequency: data.weeklyFrequency,
      });
    }

    entity.days = data.days ?? [];
    if (!entity.id) {
      entity.id = data.id;
    }

    const saved = await this.weeklyTemplateRepo.save(entity);
    return this.serializeWeeklyTemplate(saved);
  }

  private serializeWeeklyTemplate(e: STPWeeklyTemplate) {
    return {
      id: e.id,
      athleteId: e.athleteId,
      phase: e.phase,
      weekType: e.weekType,
      weeklyFrequency: e.weeklyFrequency,
      days: e.days ?? [],
      updatedAt: toIso(e.updatedAt),
    };
  }

  // ── Session Instances ───────────────────────────────────────────────────────

  async listSessions(
    athleteId: string,
    macroWeekId?: string | null,
    includePrivate = false,
    view: 'full' | 'summary' = 'full',
  ) {
    const where: Record<string, string> = { athleteId };
    if (macroWeekId) where.macroWeekId = macroWeekId;
    // Atleta: solo sesiones publicadas (sin conflictos pendientes de revisión coach)
    if (!includePrivate) {
      where.coachStatus = 'published';
    }
    const entities = await this.sessionRepo.find({
      where,
      order: { scheduledDate: 'ASC', sessionOrdinal: 'ASC' },
    });
    const filtered = entities.filter(
      (e) => includePrivate || (e.coachStatus ?? 'published') === 'published',
    );
    if (view === 'summary') {
      return filtered.map((e) => this.serializeSessionSummary(e, { includePrivate }));
    }
    return filtered.map((e) => this.serializeSession(e, { includePrivate }));
  }

  /**
   * Bootstrap del planner: profile + macro activo + sesiones summary en un round-trip.
   */
  async getPlannerBootstrap(athleteId: string, includePrivate = false) {
    const [profile, macroPlan, sessions, activeTags] = await Promise.all([
      this.ensureProfile(athleteId),
      this.getMacroPlan(athleteId),
      this.listSessions(athleteId, null, includePrivate, 'summary'),
      this.injuriesService.getActiveTags(athleteId).catch(() => []),
    ]);
    return {
      profile,
      macroPlan,
      sessions,
      activeTags,
    };
  }

  async getSession(
    athleteId: string,
    sessionId: string,
    includePrivate = false,
  ) {
    const entity = await this.sessionRepo.findOne({
      where: { id: sessionId, athleteId },
    });
    if (!entity) return null;
    if (!includePrivate && (entity.coachStatus ?? 'published') !== 'published') {
      return null;
    }
    const serialized = this.serializeSession(entity, { includePrivate });
    return this.enrichSessionWithExerciseMeta(serialized);
  }

  async saveSession(
    data: {
      id: string;
      athleteId: string;
      macroPlanId?: string | null;
      macroWeekId: string;
      weekStartDate: string;
      weekLabel: string;
      sessionOrdinal: number;
      scheduledDate: string;
      phase: string;
      weekType: string;
      pattern: string;
      templateId: string;
      templateDayId: string;
      enduranceFormat?: string | null;
      enduranceConfig?: unknown | null;
      progressionConfig?: unknown;
      warnings?: string[];
      blocks?: unknown[];
      feedbackStatus?: string;
      feedback?: unknown;
      review?: unknown;
      athleteCompletionStatus?: string;
      notes?: string | null;
      coachObservations?: string | null;
      coachStatus?: string;
      sourceWorkoutTemplateId?: string | null;
      safetyConflicts?: unknown[];
      attendanceMarkedByUserId?: string | null;
      attendanceMarkedByName?: string | null;
      attendanceMarkedAt?: string | null;
      attendanceSource?: string | null;
    },
    actor?: User,
  ) {
    const existing = await this.sessionRepo.findOne({ where: { id: data.id } });
    const isNew = !existing;
    let entity = existing ?? this.sessionRepo.create({ id: data.id });
    const isStaff = actor ? isStaffUser(actor) : false;

    const blocks = data.blocks ?? existing?.blocks ?? [];
    const safety = await this.evaluateSessionSafety(data.athleteId, blocks);
    const requestedCoachStatus =
      data.coachStatus ?? existing?.coachStatus ?? 'published';
    // Nunca publicar con conflictos de lesión
    const coachStatus =
      safety.conflicts.length > 0
        ? 'draft'
        : requestedCoachStatus === 'published'
          ? 'published'
          : 'draft';

    if (
      requestedCoachStatus === 'published' &&
      safety.conflicts.length > 0 &&
      isStaff
    ) {
      // Se fuerza draft; el cliente verá safetyConflicts y coachStatus=draft
    }

    Object.assign(entity, {
      athleteId: data.athleteId,
      macroPlanId: data.macroPlanId ?? null,
      macroWeekId: data.macroWeekId,
      weekStartDate: data.weekStartDate,
      weekLabel: data.weekLabel,
      sessionOrdinal: data.sessionOrdinal,
      scheduledDate: data.scheduledDate,
      phase: data.phase,
      weekType: data.weekType,
      pattern: data.pattern,
      templateId: data.templateId,
      templateDayId: data.templateDayId,
      enduranceFormat:
        data.enduranceFormat === undefined ? null : data.enduranceFormat,
      enduranceConfig:
        data.enduranceConfig === undefined || data.enduranceConfig === null
          ? null
          : (data.enduranceConfig as Record<string, unknown>),
      progressionConfig: data.progressionConfig ?? null,
      warnings: mergeSessionWarnings(data.warnings ?? existing?.warnings ?? [], safety.warnings),
      blocks,
      feedbackStatus: data.feedbackStatus ?? 'none',
      feedback: data.feedback ?? null,
      review: data.review ?? null,
      athleteCompletionStatus: data.athleteCompletionStatus ?? 'pending',
      coachStatus,
      sourceWorkoutTemplateId:
        data.sourceWorkoutTemplateId !== undefined
          ? data.sourceWorkoutTemplateId
          : (existing?.sourceWorkoutTemplateId ?? null),
      safetyConflicts: safety.conflicts,
      notes: data.notes ?? null,
      coachObservations: isStaff
        ? (data.coachObservations ?? null)
        : (existing?.coachObservations ?? null),
    });

    if (actor && isStaff) {
      const displayName = formatStaffDisplayName(actor);
      if (isNew) {
        entity.createdByUserId = actor.id;
        entity.createdByName = displayName;
      }
      entity.lastSavedByUserId = actor.id;
      entity.lastSavedByName = displayName;
    }

    const previousCompletion = existing?.athleteCompletionStatus ?? 'pending';
    const nextCompletion = data.athleteCompletionStatus ?? 'pending';
    const completionChanged = previousCompletion !== nextCompletion;

    if (completionChanged && isStaff && actor) {
      entity.attendanceMarkedByUserId = actor.id;
      entity.attendanceMarkedByName = formatStaffDisplayName(actor);
      entity.attendanceMarkedAt = new Date();
      entity.attendanceSource = 'coach';
    }

    const saved = await this.sessionRepo.save(entity);
    const serialized = this.serializeSession(saved, { includePrivate: isStaff });

    let attendanceSync:
      | { status: 'synced' | 'no_reservation' | 'sync_failed'; reservationsUpdated: number }
      | undefined;

    if (isStaff && completionChanged) {
      attendanceSync = await this.syncAttendanceFromSessionCompletion(
        saved.athleteId,
        saved.scheduledDate,
        nextCompletion,
      );
    }

    return attendanceSync ? { ...serialized, attendanceSync } : serialized;
  }

  private async evaluateSessionSafety(
    athleteId: string,
    blocks: unknown[],
  ): Promise<{ conflicts: SafetyConflict[]; warnings: string[] }> {
    const activeTags = await this.injuriesService.getActiveTags(athleteId);
    const activeKeys = activeTags
      .map((t) => t.key)
      .filter((k): k is string => typeof k === 'string' && !!k.trim());
    const exerciseIds = collectSafetyExerciseIds(blocks);
    const exercises =
      exerciseIds.length > 0
        ? await this.exerciseRepo.find({
            where: { id: In(exerciseIds) },
            relations: ['safetyTags'],
          })
        : [];
    const exercisesById = new Map(
      exercises.map((e) => [
        e.id,
        {
          id: e.id,
          name: e.name,
          safetyTags: e.safetyTags ?? [],
        },
      ]),
    );
    const conflicts = detectSafetyConflicts(blocks, exercisesById, activeKeys);
    return {
      conflicts,
      warnings: buildSafetyConflictWarnings(conflicts),
    };
  }

  /**
   * Best-effort: refleja athleteCompletionStatus en reservas del día.
   * Batch update (sin loop N× findOne/save). Nunca lanza — la sesión ya quedó guardada.
   */
  private async syncAttendanceFromSessionCompletion(
    athleteId: string,
    scheduledDate: string,
    completionStatus: string,
  ): Promise<{
    status: 'synced' | 'no_reservation' | 'sync_failed';
    reservationsUpdated: number;
  }> {
    const mappedAttendance: boolean | null =
      completionStatus === 'completed'
        ? true
        : completionStatus === 'skipped'
          ? false
          : null;

    try {
      const dateKey = toDateOnlyKey(scheduledDate) ?? scheduledDate;
      // Rango [dateKey, dateKey+1) para usar índice en time_slot.date (evita DATE()).
      const dayStart = new Date(`${dateKey}T00:00:00.000Z`);
      const dayEnd = new Date(dayStart);
      dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

      const reservations = await this.reservationRepo
        .createQueryBuilder('r')
        .innerJoinAndSelect('r.timeSlot', 'slot')
        .innerJoin('r.user', 'user')
        .where('user.id = :athleteId', { athleteId })
        .andWhere('slot.date >= :dayStart AND slot.date < :dayEnd', {
          dayStart,
          dayEnd,
        })
        .getMany();

      if (reservations.length === 0) {
        return { status: 'no_reservation', reservationsUpdated: 0 };
      }

      // Delta de attendedCount por timeslot (solo cuando cambia a/de true).
      const attendedDeltaBySlot = new Map<string, number>();
      for (const reservation of reservations) {
        const previous = reservation.attendanceStatus;
        let delta = 0;
        if (previous !== true && mappedAttendance === true) delta = 1;
        else if (previous === true && mappedAttendance !== true) delta = -1;
        if (delta !== 0) {
          const slotId = reservation.timeSlotId;
          attendedDeltaBySlot.set(
            slotId,
            (attendedDeltaBySlot.get(slotId) ?? 0) + delta,
          );
        }
      }

      const reservationIds = reservations.map((r) => r.id);
      await this.reservationRepo
        .createQueryBuilder()
        .update(Reservation)
        .set({ attendanceStatus: mappedAttendance })
        .whereInIds(reservationIds)
        .execute();

      for (const [slotId, delta] of attendedDeltaBySlot) {
        if (delta === 0) continue;
        const slot = await this.timeSlotRepo.findOne({ where: { id: slotId } });
        if (!slot) continue;
        const next = Math.max(0, (slot.attendedCount || 0) + delta);
        slot.attendedCount = Math.min(next, slot.reservedCount || 0);
        await this.timeSlotRepo.save(slot);
      }

      return { status: 'synced', reservationsUpdated: reservations.length };
    } catch (error) {
      this.logger.warn(
        `[syncAttendance] Failed for athlete ${athleteId} on ${scheduledDate}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { status: 'sync_failed', reservationsUpdated: 0 };
    }
  }

  async deleteSession(athleteId: string, sessionId: string) {
    const entity = await this.sessionRepo.findOne({
      where: { id: sessionId, athleteId },
    });
    if (!entity) return false;
    await this.sessionRepo.remove(entity);
    return true;
  }

  /** Vista liviana para calendario/strip: sin blocks, feedback, review ni configs pesadas. */
  private serializeSessionSummary(
    e: STPSessionInstance,
    options: { includePrivate?: boolean } = {},
  ) {
    const { includePrivate = false } = options;
    const blocks = Array.isArray(e.blocks) ? e.blocks : [];
    return {
      id: e.id,
      athleteId: e.athleteId,
      macroPlanId: e.macroPlanId ?? null,
      macroWeekId: e.macroWeekId,
      weekStartDate: e.weekStartDate,
      weekLabel: e.weekLabel,
      sessionOrdinal: e.sessionOrdinal,
      scheduledDate: e.scheduledDate,
      phase: e.phase,
      weekType: e.weekType,
      pattern: e.pattern,
      templateId: e.templateId,
      templateDayId: e.templateDayId,
      enduranceFormat: e.enduranceFormat ?? null,
      warnings: e.warnings ?? [],
      blocks: [] as unknown[],
      /** Cantidad de circuitos (summary no envía blocks). */
      blockCount: blocks.length,
      /** Volumen estimado para el calendario sin enviar blocks. */
      tonnageKg: this.estimateSessionTonnageKg(blocks),
      feedbackStatus: e.feedbackStatus,
      athleteCompletionStatus: e.athleteCompletionStatus ?? 'pending',
      coachStatus: e.coachStatus ?? 'published',
      sourceWorkoutTemplateId: e.sourceWorkoutTemplateId ?? null,
      safetyConflicts: Array.isArray(e.safetyConflicts) ? e.safetyConflicts : [],
      attendanceMarkedByUserId: e.attendanceMarkedByUserId ?? null,
      attendanceMarkedByName: e.attendanceMarkedByName ?? null,
      attendanceMarkedAt: e.attendanceMarkedAt
        ? toIso(e.attendanceMarkedAt)
        : null,
      attendanceSource: e.attendanceSource ?? null,
      notes: e.notes ?? null,
      ...(includePrivate
        ? { coachObservations: e.coachObservations ?? null }
        : {}),
      createdAt: toIso(e.createdAt),
      updatedAt: toIso(e.updatedAt),
    };
  }

  /** Estimación liviana de tonelaje (vueltas × reps × kg) para listados summary. */
  private estimateSessionTonnageKg(blocks: unknown[]): number {
    let total = 0;
    for (const raw of blocks) {
      if (!raw || typeof raw !== 'object') continue;
      const block = raw as {
        isEC?: boolean;
        sets?: number;
        exercises?: Array<{
          prescribedLoad?: number | null;
          prescribedReps?: string | number | null;
          sets?: number;
        }>;
      };
      if (block.isEC) continue;
      const blockSets = typeof block.sets === 'number' && block.sets > 0 ? block.sets : 1;
      for (const ex of block.exercises ?? []) {
        const load =
          typeof ex.prescribedLoad === 'number' && Number.isFinite(ex.prescribedLoad)
            ? ex.prescribedLoad
            : null;
        if (load == null || load <= 0) continue;
        const repsMatch = String(ex.prescribedReps ?? '').match(/\d+/);
        const reps = repsMatch ? Number(repsMatch[0]) : null;
        if (reps == null || !Number.isFinite(reps)) continue;
        const exSets =
          typeof ex.sets === 'number' && ex.sets > 0 ? ex.sets : blockSets;
        total += exSets * reps * load;
      }
    }
    return Math.round(total);
  }

  /** Respuesta mínima del PATCH de asistencia (el FE ya tiene blocks en cache). */
  private serializeSessionCompletionPatch(
    e: STPSessionInstance,
    attendanceSync?: {
      status: 'synced' | 'no_reservation' | 'sync_failed';
      reservationsUpdated: number;
    },
  ) {
    return {
      id: e.id,
      athleteId: e.athleteId,
      macroWeekId: e.macroWeekId,
      scheduledDate: e.scheduledDate,
      athleteCompletionStatus: e.athleteCompletionStatus ?? 'pending',
      attendanceMarkedByUserId: e.attendanceMarkedByUserId ?? null,
      attendanceMarkedByName: e.attendanceMarkedByName ?? null,
      attendanceMarkedAt: e.attendanceMarkedAt
        ? toIso(e.attendanceMarkedAt)
        : null,
      attendanceSource: e.attendanceSource ?? null,
      updatedAt: toIso(e.updatedAt),
      ...(attendanceSync ? { attendanceSync } : {}),
    };
  }

  private serializeSession(
    e: STPSessionInstance,
    options: { includePrivate?: boolean } = {},
  ) {
    const { includePrivate = false } = options;
    return {
      id: e.id,
      athleteId: e.athleteId,
      macroPlanId: e.macroPlanId ?? null,
      macroWeekId: e.macroWeekId,
      weekStartDate: e.weekStartDate,
      weekLabel: e.weekLabel,
      sessionOrdinal: e.sessionOrdinal,
      scheduledDate: e.scheduledDate,
      phase: e.phase,
      weekType: e.weekType,
      pattern: e.pattern,
      templateId: e.templateId,
      templateDayId: e.templateDayId,
      enduranceFormat: e.enduranceFormat ?? null,
      enduranceConfig: e.enduranceConfig ?? null,
      progressionConfig: e.progressionConfig ?? null,
      warnings: e.warnings ?? [],
      blocks: e.blocks ?? [],
      feedbackStatus: e.feedbackStatus,
      feedback: e.feedback ?? null,
      review: e.review ?? null,
      athleteCompletionStatus: e.athleteCompletionStatus ?? 'pending',
      coachStatus: e.coachStatus ?? 'published',
      sourceWorkoutTemplateId: e.sourceWorkoutTemplateId ?? null,
      safetyConflicts: Array.isArray(e.safetyConflicts) ? e.safetyConflicts : [],
      attendanceMarkedByUserId: e.attendanceMarkedByUserId ?? null,
      attendanceMarkedByName: e.attendanceMarkedByName ?? null,
      attendanceMarkedAt: e.attendanceMarkedAt
        ? toIso(e.attendanceMarkedAt)
        : null,
      attendanceSource: e.attendanceSource ?? null,
      notes: e.notes ?? null,
      ...(includePrivate
        ? { coachObservations: e.coachObservations ?? null }
        : {}),
      createdByUserId: e.createdByUserId ?? null,
      createdByName: e.createdByName ?? null,
      lastSavedByUserId: e.lastSavedByUserId ?? null,
      lastSavedByName: e.lastSavedByName ?? null,
      createdAt: toIso(e.createdAt),
      updatedAt: toIso(e.updatedAt),
    };
  }

  private collectExerciseIdsFromBlocks(blocks: unknown[]): string[] {
    const ids = new Set<string>();
    for (const block of blocks) {
      if (!block || typeof block !== 'object') continue;
      const exercises = (block as { exercises?: unknown[] }).exercises;
      if (!Array.isArray(exercises)) continue;
      for (const exercise of exercises) {
        if (!exercise || typeof exercise !== 'object') continue;
        const exerciseId = (exercise as { exerciseId?: string }).exerciseId;
        if (typeof exerciseId === 'string' && exerciseId.trim()) {
          ids.add(exerciseId.trim());
        }
      }
    }
    return [...ids];
  }

  private async loadExerciseMetaByIds(
    exerciseIds: string[],
  ): Promise<Map<string, SessionExerciseMeta>> {
    const map = new Map<string, SessionExerciseMeta>();
    if (exerciseIds.length === 0) return map;

    const exercises = await this.exerciseRepo.find({
      where: { id: In(exerciseIds) },
      relations: ['movementPattern', 'primaryCategory'],
    });

    for (const exercise of exercises) {
      map.set(exercise.id, {
        videoUrl: exercise.video?.trim() || null,
        esIsometrico: exercise.esIsometrico ?? false,
        unilateral: exercise.unilateral ?? false,
        movementPattern: exercise.movementPattern?.name?.trim() || null,
        primaryCategory: exercise.primaryCategory?.name?.trim() || null,
      });
    }

    return map;
  }

  private enrichBlocksWithExerciseMeta(
    blocks: unknown[],
    metaById: Map<string, SessionExerciseMeta>,
  ): unknown[] {
    return blocks.map((block) => {
      if (!block || typeof block !== 'object') return block;
      const blockObj = block as { exercises?: unknown[] };
      if (!Array.isArray(blockObj.exercises)) return block;

      return {
        ...blockObj,
        exercises: blockObj.exercises.map((exercise) => {
          if (!exercise || typeof exercise !== 'object') return exercise;
          const ex = exercise as { exerciseId?: string };
          const exerciseId =
            typeof ex.exerciseId === 'string' ? ex.exerciseId.trim() : '';
          const meta = exerciseId ? metaById.get(exerciseId) : undefined;
          if (!meta) return exercise;

          return {
            ...ex,
            videoUrl: meta.videoUrl,
            esIsometrico: meta.esIsometrico,
            unilateral: meta.unilateral,
            movementPattern: meta.movementPattern ?? (ex as { movementPattern?: string | null }).movementPattern ?? null,
            primaryCategory: meta.primaryCategory,
          };
        }),
      };
    });
  }

  private async enrichSessionWithExerciseMeta(
    session: ReturnType<TrainingPlannerService['serializeSession']>,
  ) {
    const blocks = Array.isArray(session.blocks) ? session.blocks : [];
    const exerciseIds = this.collectExerciseIdsFromBlocks(blocks);
    const metaById = await this.loadExerciseMetaByIds(exerciseIds);

    return {
      ...session,
      blocks: this.enrichBlocksWithExerciseMeta(blocks, metaById),
    };
  }

  /**
   * Merge seguro de feedback por ejercicio/circuito/sesión.
   * No usa los defaults destructivos de saveSession.
   */
  async mergeSessionFeedback(sessionId: string, input: MergeFeedbackInput) {
    const entity = await this.sessionRepo.findOne({
      where: { id: sessionId, athleteId: input.athleteId },
    });
    if (!entity) {
      throw new NotFoundException(`Sesión ${sessionId} no encontrada`);
    }

    const status = entity.feedbackStatus ?? 'none';
    if (status === 'pending_review' || status === 'approved') {
      throw new BadRequestException(
        'Esta sesión ya tiene feedback enviado o aprobado y no se puede modificar.',
      );
    }

    const source = input.source ?? 'athlete';
    const sessionComments =
      typeof input.comments === 'string' ? input.comments.trim() : '';
    const rawExercises = Array.isArray(input.exercises) ? input.exercises : [];

    for (const fb of rawExercises) {
      if (!fb?.sessionExerciseId) {
        throw new BadRequestException('Cada ejercicio necesita sessionExerciseId.');
      }
    }

    // Atleta draft/block y entrenador final: solo ítems con datos. Final atleta también filtra vacíos.
    const exercises = rawExercises.filter((fb) => exerciseFeedbackHasData(fb));

    const allowCommentsOnlyFinal =
      input.mode === 'final' && sessionComments.length > 0;
    const allowEmptyBlockClear = input.mode === 'block';

    if (exercises.length === 0 && !allowCommentsOnlyFinal && !allowEmptyBlockClear) {
      throw new BadRequestException(
        'No se puede guardar feedback vacío. Completá reps, carga, RPE, dolor, comentario de ejercicio o un comentario general.',
      );
    }

    if (input.mode === 'draft' && exercises.length === 0) {
      throw new BadRequestException(
        'No se puede guardar feedback vacío. Completá al menos un dato de algún ejercicio.',
      );
    }

    type BlockExercise = {
      id: string;
      prescribedReps?: unknown;
      actualFeedback?: Record<string, unknown> | null;
      [key: string]: unknown;
    };
    type SessionBlock = {
      id: string;
      exercises?: BlockExercise[];
      [key: string]: unknown;
    };

    const blocks = (Array.isArray(entity.blocks) ? entity.blocks : []) as SessionBlock[];
    const feedbackMap = new Map(
      exercises.map((e) => [e.sessionExerciseId, e] as const),
    );

    if (input.mode === 'block') {
      if (!input.blockId?.trim()) {
        throw new BadRequestException('blockId es requerido para guardar un circuito.');
      }
      const block = blocks.find((b) => b.id === input.blockId);
      if (!block) {
        throw new BadRequestException(`Circuito ${input.blockId} no encontrado en la sesión.`);
      }
      // exercises vacío = limpiar todo el feedback de ese circuito (permitido).
    }

    const targetBlockId = input.mode === 'block' ? input.blockId : null;
    // final atleta: el formulario es la fuente de verdad (reemplaza todo).
    // block: reemplaza solo el circuito guardado (los vacíos se limpian).
    // draft: merge aditivo (compatibilidad).
    const replaceAllAthleteFinal = input.mode === 'final' && source === 'athlete';

    const updatedBlocks: SessionBlock[] = blocks.map((block) => {
      const isTargetBlock = targetBlockId != null && block.id === targetBlockId;
      return {
        ...block,
        exercises: (block.exercises ?? []).map((exercise) => {
          const fb = feedbackMap.get(exercise.id);
          if (fb) {
            const actualReps = fb.actualReps ?? null;
            const actualLoad = fb.actualLoad ?? null;
            const rpe = fb.rpe ?? null;
            const pain = fb.pain === true;
            return {
              ...exercise,
              actualFeedback: {
                actualReps,
                actualLoad,
                rpe,
                pain,
                comments: fb.comments,
                decision: computeDecisionFromFeedback({
                  prescribedReps: exercise.prescribedReps,
                  actualReps,
                  rpe,
                  pain,
                }),
              },
            };
          }
          if (replaceAllAthleteFinal || isTargetBlock) {
            return { ...exercise, actualFeedback: null };
          }
          return exercise;
        }),
      };
    });

    // Final atleta: basta con algún ejercicio con datos o comentario general.
    if (input.mode === 'final' && source === 'athlete') {
      const hasAnyExerciseFeedback = exercises.length > 0;
      if (!hasAnyExerciseFeedback && !sessionComments) {
        throw new BadRequestException(
          'Completá al menos un ejercicio o un comentario general antes de enviar la sesión.',
        );
      }
    }

    const existingFeedback =
      entity.feedback && typeof entity.feedback === 'object'
        ? (entity.feedback as Record<string, unknown>)
        : {};
    const existingExercises = Array.isArray(existingFeedback.exercises)
      ? (existingFeedback.exercises as Array<Record<string, unknown>>)
      : [];
    const mergedExercisesById = new Map<string, Record<string, unknown>>();

    if (!replaceAllAthleteFinal) {
      for (const ex of existingExercises) {
        const id = ex.sessionExerciseId;
        if (typeof id === 'string') mergedExercisesById.set(id, ex);
      }
    }

    if (input.mode === 'block' && targetBlockId) {
      const targetBlock = blocks.find((b) => b.id === targetBlockId);
      for (const ex of targetBlock?.exercises ?? []) {
        if (typeof ex.id === 'string') mergedExercisesById.delete(ex.id);
      }
    }

    for (const fb of exercises) {
      mergedExercisesById.set(fb.sessionExerciseId, {
        sessionExerciseId: fb.sessionExerciseId,
        actualReps: fb.actualReps ?? null,
        actualLoad: fb.actualLoad ?? null,
        rpe: fb.rpe ?? null,
        pain: fb.pain === true,
        comments: fb.comments,
      });
    }
    const mergedExercises = Array.from(mergedExercisesById.values());

    const summary = getSessionRpeSummary(updatedBlocks);
    const sessionPain = updatedBlocks.some((block) =>
      (block.exercises ?? []).some(
        (ex) => (ex.actualFeedback as { pain?: boolean } | null)?.pain === true,
      ),
    );

    const submittedBy = input.submittedBy ?? 'Atleta';
    const nextStatus =
      input.mode === 'final'
        ? source === 'trainer'
          ? 'approved'
          : 'pending_review'
        : status === 'rejected'
          ? 'rejected'
          : 'none';

    const feedback = {
      id:
        typeof existingFeedback.id === 'string' && existingFeedback.id
          ? existingFeedback.id
          : `session-feedback-${randomUUID()}`,
      source,
      submittedBy,
      submittedAt: new Date().toISOString(),
      comments:
        input.comments !== undefined
          ? input.comments
          : (existingFeedback.comments as string | undefined),
      exercises: mergedExercises,
      blockRpe: summary.blockRpe,
      sessionRpe: summary.sessionRpe,
      sessionPain,
    };

    entity.blocks = updatedBlocks;
    entity.feedback = feedback;
    entity.feedbackStatus = nextStatus;

    if (input.mode === 'final') {
      // Feedback válido confirma asistencia operativa
      if (entity.athleteCompletionStatus !== 'completed') {
        entity.athleteCompletionStatus = 'completed';
        entity.attendanceSource = 'athlete_feedback';
        entity.attendanceMarkedAt = new Date();
        entity.attendanceMarkedByUserId = null;
        entity.attendanceMarkedByName =
          source === 'trainer' ? submittedBy : 'Atleta';
      }
    }

    if (input.mode === 'final' && source === 'trainer') {
      entity.review = {
        id: `trainer-review-${randomUUID()}`,
        reviewerName: submittedBy,
        reviewedAt: new Date().toISOString(),
        decision: 'approved',
        notes: 'Feedback cargado por el entrenador.',
      };
    }

    const saved = await this.sessionRepo.save(entity);

    if (
      input.mode === 'final' &&
      entity.athleteCompletionStatus === 'completed'
    ) {
      await this.syncAttendanceFromSessionCompletion(
        saved.athleteId,
        saved.scheduledDate,
        'completed',
      );
    }

    const serialized = this.serializeSession(saved);
    return this.enrichSessionWithExerciseMeta(serialized);
  }

  /**
   * Deshace un envío pendiente: vuelve a `none` y conserva feedback/actualFeedback
   * para que el atleta pueda corregir y reenviar.
   */
  async withdrawSessionFeedback(sessionId: string, athleteId: string) {
    if (!athleteId?.trim()) {
      throw new BadRequestException('athleteId es requerido.');
    }

    const entity = await this.sessionRepo.findOne({
      where: { id: sessionId, athleteId },
    });
    if (!entity) {
      throw new NotFoundException(`Sesión ${sessionId} no encontrada`);
    }

    const status = entity.feedbackStatus ?? 'none';
    if (status !== 'pending_review') {
      throw new BadRequestException(
        status === 'approved'
          ? 'El feedback ya fue aprobado. Pedile a tu entrenador que lo rechace si necesitás corregirlo.'
          : 'Solo se puede deshacer un feedback pendiente de revisión.',
      );
    }

    entity.feedbackStatus = 'none';
    const saved = await this.sessionRepo.save(entity);
    const serialized = this.serializeSession(saved);
    return this.enrichSessionWithExerciseMeta(serialized);
  }

  /** Alumnos del centro sin rutina planificada hace más de N días. */
  async getPlanningGaps(companyId: string, days = 7) {
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - days);
    const thresholdStr = thresholdDate.toISOString().split('T')[0];
    const todayStr = new Date().toISOString().split('T')[0];

    const invitations = await this.invitationRepo.find({
      where: {
        company: { id: companyId },
        status: InvitationStatus.APPROVED,
      },
      relations: ['user'],
    });

    const activeAthletes = invitations.filter(
      (inv) => inv.user && !inv.user.evaluationPortalOnly,
    );

    if (activeAthletes.length === 0) {
      return { thresholdDays: days, athletes: [], total: 0 };
    }

    const athleteIds = activeAthletes.map((inv) => inv.user.id);

    const plannedRows = await this.sessionRepo
      .createQueryBuilder('s')
      .select('s.athleteId', 'athleteId')
      .addSelect('MAX(s.scheduledDate)', 'lastPlannedDate')
      .where('s.athleteId IN (:...athleteIds)', { athleteIds })
      .andWhere(
        "(jsonb_array_length(COALESCE(s.blocks, '[]'::jsonb)) > 0 OR s.template_id = 'libre')",
      )
      .groupBy('s.athleteId')
      .getRawMany<{ athleteId: string; lastPlannedDate: string }>();

    const lastPlannedByAthlete = new Map(
      plannedRows.map((row) => [row.athleteId, row.lastPlannedDate]),
    );

    const gaps = activeAthletes
      .map((inv) => {
        const athleteId = inv.user.id;
        const lastPlannedDate = lastPlannedByAthlete.get(athleteId) ?? null;
        const isGap =
          !lastPlannedDate || lastPlannedDate < thresholdStr;

        if (!isGap) return null;

        let daysWithoutPlanning: number | null = null;
        if (lastPlannedDate) {
          const diffMs =
            new Date(todayStr).getTime() -
            new Date(lastPlannedDate).getTime();
          daysWithoutPlanning = Math.max(
            0,
            Math.floor(diffMs / (1000 * 60 * 60 * 24)),
          );
        }

        return {
          athleteId,
          name: inv.user.name ?? '',
          lastName: inv.user.lastName ?? '',
          lastPlannedDate,
          daysWithoutPlanning,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .sort((a, b) => {
        if (a.daysWithoutPlanning === null) return -1;
        if (b.daysWithoutPlanning === null) return 1;
        return b.daysWithoutPlanning - a.daysWithoutPlanning;
      });

    return {
      thresholdDays: days,
      athletes: gaps,
      total: gaps.length,
    };
  }

  /**
   * Alumnos activos del centro agrupados por inactividad de entrenamiento confirmado.
   * Buckets excluyentes: neverTrained | oneToTwoWeeks (7–13) | twoWeeksOrMore (14+).
   */
  async getTrainingInactivity(companyId: string, actor?: User) {
    const referenceDate = calendarDateInArgentina();
    const scope = await resolveCoachDivisionScope(
      this.companyRepo,
      this.divisionRepo,
      actor,
      companyId,
    );

    if (scope.scoped && scope.divisionIds.length === 0) {
      return buildTrainingInactivityGroups([], referenceDate);
    }

    const qb = this.invitationRepo
      .createQueryBuilder('inv')
      .innerJoinAndSelect('inv.user', 'user')
      .where('inv.companyId = :cid', { cid: companyId })
      .andWhere('inv.status = :status', { status: InvitationStatus.APPROVED });

    if (scope.scoped) {
      qb.andWhere('inv.division_id IN (:...divIds)', {
        divIds: scope.divisionIds,
      });
    }

    const invitations = await qb.orderBy('inv.approvedAt', 'DESC').getMany();
    const rosterAthletes = invitations.filter(
      (inv) => inv.user && !inv.user.evaluationPortalOnly,
    );

    if (rosterAthletes.length === 0) {
      return buildTrainingInactivityGroups([], referenceDate);
    }

    const suspensions = await this.suspensionRepo.find({
      where: {
        companyId,
        isActive: true,
      },
      select: ['userId', 'startDate', 'endDate', 'isActive'],
    });
    const suspendedIds = collectSuspendedAthleteIds(suspensions, referenceDate);

    const activeAthletes = rosterAthletes.filter(
      (inv) => !suspendedIds.has(inv.user.id),
    );

    if (activeAthletes.length === 0) {
      return buildTrainingInactivityGroups([], referenceDate);
    }

    const athleteIds = activeAthletes.map((inv) => inv.user.id);

    const [confirmedRows, plannedRows] = await Promise.all([
      this.sessionRepo
        .createQueryBuilder('s')
        .select('s.athleteId', 'athleteId')
        .addSelect('MAX(s.scheduledDate)', 'lastTrainingDate')
        .where('s.athleteId IN (:...athleteIds)', { athleteIds })
        .andWhere('s.scheduledDate <= :referenceDate', { referenceDate })
        .andWhere("s.athleteCompletionStatus <> 'skipped'")
        .andWhere(
          "(s.athleteCompletionStatus = 'completed' OR s.feedbackStatus IN ('pending_review', 'approved'))",
        )
        .groupBy('s.athleteId')
        .getRawMany<{ athleteId: string; lastTrainingDate: string }>(),
      this.sessionRepo
        .createQueryBuilder('s')
        .select('s.athleteId', 'athleteId')
        .addSelect('MAX(s.scheduledDate)', 'lastPlannedDate')
        .where('s.athleteId IN (:...athleteIds)', { athleteIds })
        .andWhere(
          "(jsonb_array_length(COALESCE(s.blocks, '[]'::jsonb)) > 0 OR s.template_id = 'libre')",
        )
        .groupBy('s.athleteId')
        .getRawMany<{ athleteId: string; lastPlannedDate: string }>(),
    ]);

    const lastTrainingByAthlete = new Map(
      confirmedRows.map((row) => [row.athleteId, row.lastTrainingDate]),
    );
    const lastPlannedByAthlete = new Map(
      plannedRows.map((row) => [row.athleteId, row.lastPlannedDate]),
    );

    const athletes = activeAthletes.map((inv) => ({
      athleteId: inv.user.id,
      name: inv.user.name ?? '',
      lastName: inv.user.lastName ?? '',
      phone:
        inv.user.phoneNumber != null && inv.user.phoneNumber !== undefined
          ? String(inv.user.phoneNumber)
          : null,
      lastTrainingDate: lastTrainingByAthlete.get(inv.user.id) ?? null,
      lastPlannedDate: lastPlannedByAthlete.get(inv.user.id) ?? null,
    }));

    return buildTrainingInactivityGroups(athletes, referenceDate);
  }

  // ── Workout Collections (carpetas del centro) ──────────────────────────────

  private serializeWorkoutCollection(e: STPWorkoutCollection) {
    return {
      id: e.id,
      companyId: e.companyId,
      name: e.name,
      description: e.description ?? null,
      sortOrder: e.sortOrder ?? 0,
      isActive: e.isActive,
      createdByUserId: e.createdByUserId ?? null,
      createdByName: e.createdByName ?? null,
      lastEditedByUserId: e.lastEditedByUserId ?? null,
      lastEditedByName: e.lastEditedByName ?? null,
      createdAt: toIso(e.createdAt),
      updatedAt: toIso(e.updatedAt),
    };
  }

  async listWorkoutCollections(companyId: string) {
    const entities = await this.workoutCollectionRepo.find({
      where: { companyId, isActive: true },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
    return entities.map((e) => this.serializeWorkoutCollection(e));
  }

  async createWorkoutCollection(
    companyId: string,
    dto: CreateWorkoutCollectionDto,
    actor: User,
  ) {
    const displayName = formatStaffDisplayName(actor);
    const entity = this.workoutCollectionRepo.create({
      companyId,
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      sortOrder: dto.sortOrder ?? 0,
      isActive: true,
      createdByUserId: actor.id,
      createdByName: displayName,
      lastEditedByUserId: actor.id,
      lastEditedByName: displayName,
    });
    const saved = await this.workoutCollectionRepo.save(entity);
    return this.serializeWorkoutCollection(saved);
  }

  async updateWorkoutCollection(
    companyId: string,
    collectionId: string,
    dto: UpdateWorkoutCollectionDto,
    actor: User,
  ) {
    const entity = await this.workoutCollectionRepo.findOne({
      where: { id: collectionId, companyId },
    });
    if (!entity || !entity.isActive) {
      throw new NotFoundException('Colección no encontrada');
    }
    if (dto.name !== undefined) entity.name = dto.name.trim();
    if (dto.description !== undefined) {
      entity.description = dto.description?.trim() || null;
    }
    if (dto.sortOrder !== undefined) entity.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) entity.isActive = dto.isActive;
    entity.lastEditedByUserId = actor.id;
    entity.lastEditedByName = formatStaffDisplayName(actor);
    const saved = await this.workoutCollectionRepo.save(entity);
    return this.serializeWorkoutCollection(saved);
  }

  async deleteWorkoutCollection(
    companyId: string,
    collectionId: string,
    actor: User,
  ) {
    const entity = await this.workoutCollectionRepo.findOne({
      where: { id: collectionId, companyId, isActive: true },
    });
    if (!entity) throw new NotFoundException('Colección no encontrada');
    entity.isActive = false;
    entity.lastEditedByUserId = actor.id;
    entity.lastEditedByName = formatStaffDisplayName(actor);
    await this.workoutCollectionRepo.save(entity);
    return { ok: true };
  }

  private async assertCollectionBelongsToCompany(
    companyId: string,
    collectionId: string | null | undefined,
  ): Promise<string | null> {
    if (collectionId == null || collectionId === '') return null;
    const collection = await this.workoutCollectionRepo.findOne({
      where: { id: collectionId, companyId, isActive: true },
    });
    if (!collection) {
      throw new BadRequestException(
        'La colección no existe o no pertenece a este centro.',
      );
    }
    return collection.id;
  }

  // ── Workout Templates (biblioteca del centro) ───────────────────────────────

  private serializeWorkoutTemplate(e: STPWorkoutTemplate) {
    return {
      id: e.id,
      companyId: e.companyId,
      name: e.name,
      description: e.description ?? null,
      phase: e.phase ?? null,
      pattern: e.pattern ?? null,
      collectionId: e.collectionId ?? null,
      tags: e.tags ?? [],
      sortOrder: e.sortOrder ?? 0,
      isActive: e.isActive,
      blocks: e.blocks ?? [],
      enduranceFormat: e.enduranceFormat ?? null,
      enduranceConfig: e.enduranceConfig ?? null,
      createdByUserId: e.createdByUserId ?? null,
      createdByName: e.createdByName ?? null,
      lastEditedByUserId: e.lastEditedByUserId ?? null,
      lastEditedByName: e.lastEditedByName ?? null,
      createdAt: toIso(e.createdAt),
      updatedAt: toIso(e.updatedAt),
    };
  }

  async listWorkoutTemplates(companyId: string) {
    const entities = await this.workoutTemplateRepo.find({
      where: { companyId, isActive: true },
      order: { sortOrder: 'ASC', updatedAt: 'DESC' },
    });
    return entities.map((e) => this.serializeWorkoutTemplate(e));
  }

  async getWorkoutTemplate(companyId: string, templateId: string) {
    const entity = await this.workoutTemplateRepo.findOne({
      where: { id: templateId, companyId, isActive: true },
    });
    if (!entity) throw new NotFoundException('Workout template no encontrado');
    return this.serializeWorkoutTemplate(entity);
  }

  async createWorkoutTemplate(
    companyId: string,
    dto: CreateWorkoutTemplateDto,
    actor: User,
  ) {
    const displayName = formatStaffDisplayName(actor);
    const collectionId = await this.assertCollectionBelongsToCompany(
      companyId,
      dto.collectionId,
    );
    const entity = this.workoutTemplateRepo.create({
      companyId,
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      phase: dto.phase ?? null,
      pattern: dto.pattern ?? null,
      collectionId,
      tags: dto.tags ?? [],
      sortOrder: dto.sortOrder ?? 0,
      isActive: true,
      blocks: dto.blocks ?? [],
      enduranceFormat: dto.enduranceFormat ?? null,
      enduranceConfig: dto.enduranceConfig ?? null,
      createdByUserId: actor.id,
      createdByName: displayName,
      lastEditedByUserId: actor.id,
      lastEditedByName: displayName,
    });
    const saved = await this.workoutTemplateRepo.save(entity);
    return this.serializeWorkoutTemplate(saved);
  }

  async updateWorkoutTemplate(
    companyId: string,
    templateId: string,
    dto: UpdateWorkoutTemplateDto,
    actor: User,
  ) {
    const entity = await this.workoutTemplateRepo.findOne({
      where: { id: templateId, companyId },
    });
    if (!entity || !entity.isActive) {
      throw new NotFoundException('Workout template no encontrado');
    }
    if (dto.name !== undefined) entity.name = dto.name.trim();
    if (dto.description !== undefined) {
      entity.description = dto.description?.trim() || null;
    }
    if (dto.phase !== undefined) entity.phase = dto.phase;
    if (dto.pattern !== undefined) entity.pattern = dto.pattern;
    if (dto.collectionId !== undefined) {
      entity.collectionId = await this.assertCollectionBelongsToCompany(
        companyId,
        dto.collectionId,
      );
    }
    if (dto.tags !== undefined) entity.tags = dto.tags;
    if (dto.sortOrder !== undefined) entity.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) entity.isActive = dto.isActive;
    if (dto.blocks !== undefined) entity.blocks = dto.blocks;
    if (dto.enduranceFormat !== undefined) {
      entity.enduranceFormat = dto.enduranceFormat;
    }
    if (dto.enduranceConfig !== undefined) {
      entity.enduranceConfig = dto.enduranceConfig;
    }
    entity.lastEditedByUserId = actor.id;
    entity.lastEditedByName = formatStaffDisplayName(actor);
    const saved = await this.workoutTemplateRepo.save(entity);
    return this.serializeWorkoutTemplate(saved);
  }

  async deleteWorkoutTemplate(companyId: string, templateId: string, actor: User) {
    const entity = await this.workoutTemplateRepo.findOne({
      where: { id: templateId, companyId, isActive: true },
    });
    if (!entity) throw new NotFoundException('Workout template no encontrado');
    entity.isActive = false;
    entity.lastEditedByUserId = actor.id;
    entity.lastEditedByName = formatStaffDisplayName(actor);
    await this.workoutTemplateRepo.save(entity);
    return { ok: true };
  }

  private cloneBlocksWithNewIds(blocks: unknown[]): unknown[] {
    if (!Array.isArray(blocks)) return [];
    return blocks.map((block) => {
      if (!block || typeof block !== 'object') return block;
      const b = block as Record<string, unknown>;
      const exercises = Array.isArray(b.exercises) ? b.exercises : [];
      return {
        ...b,
        id: `block-${randomUUID()}`,
        exercises: exercises.map((ex) => {
          if (!ex || typeof ex !== 'object') return ex;
          const e = ex as Record<string, unknown>;
          return {
            ...e,
            id: `session-exercise-${randomUUID()}`,
            actualFeedback: null,
            warnings: Array.isArray(e.warnings) ? e.warnings : [],
          };
        }),
      };
    });
  }

  async instantiateWorkoutTemplate(
    companyId: string,
    templateId: string,
    dto: InstantiateWorkoutTemplateDto,
    actor: User,
  ) {
    await this.assertCanAccessTrainingAthlete(actor, dto.athleteId, true);
    const template = await this.workoutTemplateRepo.findOne({
      where: { id: templateId, companyId, isActive: true },
    });
    if (!template) throw new NotFoundException('Workout template no encontrado');

    const sourceBlocks =
      dto.blocks !== undefined ? dto.blocks : template.blocks;
    const blocks = this.cloneBlocksWithNewIds(
      Array.isArray(sourceBlocks) ? sourceBlocks : [],
    );
    const safety = await this.evaluateSessionSafety(dto.athleteId, blocks);
    const sessionId = `session-${randomUUID()}`;
    const displayName = formatStaffDisplayName(actor);

    const entity = this.sessionRepo.create({
      id: sessionId,
      athleteId: dto.athleteId,
      macroPlanId: dto.macroPlanId ?? null,
      macroWeekId: dto.macroWeekId,
      weekStartDate: dto.weekStartDate,
      weekLabel: dto.weekLabel,
      sessionOrdinal: dto.sessionOrdinal,
      scheduledDate: dto.scheduledDate,
      phase: dto.phase ?? template.phase ?? 'adaptacion',
      weekType: dto.weekType ?? 'carga',
      pattern: dto.pattern ?? template.pattern ?? 'libre',
      templateId: dto.templateId ?? 'libre',
      templateDayId: dto.templateDayId ?? 'libre',
      enduranceFormat: template.enduranceFormat,
      enduranceConfig: template.enduranceConfig,
      progressionConfig: dto.progressionConfig ?? null,
      warnings: mergeSessionWarnings([], safety.warnings),
      blocks,
      feedbackStatus: 'none',
      feedback: null,
      review: null,
      athleteCompletionStatus: 'pending',
      coachStatus: 'draft',
      sourceWorkoutTemplateId: template.id,
      safetyConflicts: safety.conflicts,
      notes: null,
      coachObservations: null,
      createdByUserId: actor.id,
      createdByName: displayName,
      lastSavedByUserId: actor.id,
      lastSavedByName: displayName,
    });

    const saved = await this.sessionRepo.save(entity);
    return this.serializeSession(saved, { includePrivate: true });
  }

  async publishSession(sessionId: string, athleteId: string, actor: User) {
    await this.assertCanAccessTrainingAthlete(actor, athleteId, true);
    const entity = await this.sessionRepo.findOne({
      where: { id: sessionId, athleteId },
    });
    if (!entity) throw new NotFoundException('Sesión no encontrada');

    const blocks = Array.isArray(entity.blocks) ? entity.blocks : [];
    if (blocks.length === 0) {
      throw new BadRequestException(
        'No se puede publicar una sesión sin circuitos.',
      );
    }

    const safety = await this.evaluateSessionSafety(athleteId, blocks);
    entity.safetyConflicts = safety.conflicts;
    entity.warnings = mergeSessionWarnings(entity.warnings, safety.warnings);

    if (safety.conflicts.length > 0) {
      entity.coachStatus = 'draft';
      await this.sessionRepo.save(entity);
      throw new BadRequestException({
        message:
          'No se puede publicar: hay ejercicios incompatibles con lesiones activas.',
        safetyConflicts: safety.conflicts,
      });
    }

    entity.coachStatus = 'published';
    entity.lastSavedByUserId = actor.id;
    entity.lastSavedByName = formatStaffDisplayName(actor);
    const saved = await this.sessionRepo.save(entity);
    return this.serializeSession(saved, { includePrivate: true });
  }

  async updateSessionCompletion(
    sessionId: string,
    athleteId: string,
    athleteCompletionStatus: 'pending' | 'completed' | 'skipped',
    actor: User,
  ) {
    await this.assertCanAccessTrainingAthlete(actor, athleteId, true);
    const entity = await this.sessionRepo.findOne({
      where: { id: sessionId, athleteId },
    });
    if (!entity) throw new NotFoundException('Sesión no encontrada');

    const previous = entity.athleteCompletionStatus ?? 'pending';
    entity.athleteCompletionStatus = athleteCompletionStatus;
    entity.attendanceMarkedByUserId = actor.id;
    entity.attendanceMarkedByName = formatStaffDisplayName(actor);
    entity.attendanceMarkedAt = new Date();
    entity.attendanceSource = 'coach';
    entity.lastSavedByUserId = actor.id;
    entity.lastSavedByName = formatStaffDisplayName(actor);

    const saved = await this.sessionRepo.save(entity);
    let attendanceSync:
      | { status: 'synced' | 'no_reservation' | 'sync_failed'; reservationsUpdated: number }
      | undefined;

    if (previous !== athleteCompletionStatus) {
      attendanceSync = await this.syncAttendanceFromSessionCompletion(
        athleteId,
        saved.scheduledDate,
        athleteCompletionStatus,
      );
    }

    const serialized = this.serializeSessionCompletionPatch(saved, attendanceSync);
    return serialized;
  }

  async validateSessionSafety(sessionId: string, athleteId: string) {
    const entity = await this.sessionRepo.findOne({
      where: { id: sessionId, athleteId },
    });
    if (!entity) throw new NotFoundException('Sesión no encontrada');
    const blocks = Array.isArray(entity.blocks) ? entity.blocks : [];
    return this.evaluateSessionSafety(athleteId, blocks);
  }

  /**
   * Reaudita sesiones futuras del atleta tras un cambio de lesión.
   * Las incompatibles pasan a draft y se ocultan al atleta.
   */
  async reauditFutureSessionsForAthlete(athleteId: string): Promise<{
    blockedCount: number;
    sessionIds: string[];
  }> {
    const today = calendarDateInArgentina(new Date());
    const sessions = await this.sessionRepo.find({
      where: {
        athleteId,
        scheduledDate: MoreThanOrEqual(today),
      },
    });

    const blockedIds: string[] = [];
    for (const session of sessions) {
      const blocks = Array.isArray(session.blocks) ? session.blocks : [];
      if (blocks.length === 0) continue;
      const safety = await this.evaluateSessionSafety(athleteId, blocks);
      const prevConflicts = Array.isArray(session.safetyConflicts)
        ? session.safetyConflicts.length
        : 0;
      session.safetyConflicts = safety.conflicts;
      session.warnings = mergeSessionWarnings(session.warnings, safety.warnings);
      if (safety.conflicts.length > 0) {
        session.coachStatus = 'draft';
        blockedIds.push(session.id);
      } else if (prevConflicts > 0 && session.coachStatus === 'draft') {
        // No auto-publicar: el entrenador debe revisar y publicar
      }
      await this.sessionRepo.save(session);
    }

    return { blockedCount: blockedIds.length, sessionIds: blockedIds };
  }
}
