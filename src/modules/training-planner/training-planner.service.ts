import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { In, Repository } from 'typeorm';
import { UserRole } from 'src/common/enums/enums';
import { STPTrainingProfile } from 'src/entities/stp-training-profile.entity';
import { STPMacroPlan } from 'src/entities/stp-macro-plan.entity';
import { STPWeeklyTemplate } from 'src/entities/stp-weekly-template.entity';
import { STPSessionInstance } from 'src/entities/stp-session-instance.entity';
import { Exercise } from 'src/entities/excercise.entity';
import { User } from 'src/entities/user.entity';

interface SessionExerciseMeta {
  videoUrl: string | null;
  esIsometrico: boolean;
  unilateral: boolean;
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
  constructor(
    @InjectRepository(STPTrainingProfile)
    private readonly profileRepo: Repository<STPTrainingProfile>,
    @InjectRepository(STPMacroPlan)
    private readonly macroPlanRepo: Repository<STPMacroPlan>,
    @InjectRepository(STPWeeklyTemplate)
    private readonly weeklyTemplateRepo: Repository<STPWeeklyTemplate>,
    @InjectRepository(STPSessionInstance)
    private readonly sessionRepo: Repository<STPSessionInstance>,
    @InjectRepository(Exercise)
    private readonly exerciseRepo: Repository<Exercise>,
  ) {}

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
    const saved = await this.profileRepo.save(entity);
    return this.serializeProfile(saved);
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

  async listSessions(athleteId: string, macroWeekId?: string | null) {
    const where: Record<string, string> = { athleteId };
    if (macroWeekId) where.macroWeekId = macroWeekId;
    const entities = await this.sessionRepo.find({
      where,
      order: { scheduledDate: 'ASC', sessionOrdinal: 'ASC' },
    });
    return entities.map((e) => this.serializeSession(e));
  }

  async getSession(athleteId: string, sessionId: string) {
    const entity = await this.sessionRepo.findOne({
      where: { id: sessionId, athleteId },
    });
    if (!entity) return null;
    const serialized = this.serializeSession(entity);
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
    },
    actor?: User,
  ) {
    const existing = await this.sessionRepo.findOne({ where: { id: data.id } });
    const isNew = !existing;
    let entity = existing ?? this.sessionRepo.create({ id: data.id });

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
      warnings: data.warnings ?? [],
      blocks: data.blocks ?? [],
      feedbackStatus: data.feedbackStatus ?? 'none',
      feedback: data.feedback ?? null,
      review: data.review ?? null,
      athleteCompletionStatus: data.athleteCompletionStatus ?? 'pending',
      notes: data.notes ?? null,
    });

    if (actor && isStaffUser(actor)) {
      const displayName = formatStaffDisplayName(actor);
      if (isNew) {
        entity.createdByUserId = actor.id;
        entity.createdByName = displayName;
      }
      entity.lastSavedByUserId = actor.id;
      entity.lastSavedByName = displayName;
    }

    const saved = await this.sessionRepo.save(entity);
    return this.serializeSession(saved);
  }

  async deleteSession(athleteId: string, sessionId: string) {
    const entity = await this.sessionRepo.findOne({
      where: { id: sessionId, athleteId },
    });
    if (!entity) return false;
    await this.sessionRepo.remove(entity);
    return true;
  }

  private serializeSession(e: STPSessionInstance) {
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
      notes: e.notes ?? null,
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
      select: ['id', 'video', 'esIsometrico', 'unilateral'],
    });

    for (const exercise of exercises) {
      map.set(exercise.id, {
        videoUrl: exercise.video?.trim() || null,
        esIsometrico: exercise.esIsometrico ?? false,
        unilateral: exercise.unilateral ?? false,
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
    const serialized = this.serializeSession(saved);
    return this.enrichSessionWithExerciseMeta(serialized);
  }
}
