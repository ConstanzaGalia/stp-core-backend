import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { STPGroupProgram } from 'src/entities/stp-group-program.entity';
import { STPGroupProgramSlot } from 'src/entities/stp-group-program-slot.entity';
import { STPGroupProgramEnrollment } from 'src/entities/stp-group-program-enrollment.entity';
import { STPSessionInstance } from 'src/entities/stp-session-instance.entity';
import { STPWorkoutTemplate } from 'src/entities/stp-workout-template.entity';
import { User } from 'src/entities/user.entity';
import { calendarDateInArgentina } from 'src/common/utils/date-only.util';
import { TrainingPlannerService } from './training-planner.service';
import { mergeSessionWarnings } from './session-safety.util';
import {
  defaultTrainingDaysForFrequency,
  scheduledDateForAthleteSlot,
  weekStartDateForProgram,
} from './group-program-date.util';
import {
  CreateGroupProgramDto,
  EnrollGroupProgramDto,
  ReplaceGroupProgramSlotsDto,
  UpdateGroupProgramDto,
} from './dto/group-program.dto';

function staffName(user: User): string {
  const parts = [user.name, user.lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : user.email ?? 'Staff';
}

function macroWeekIdFor(programId: string, weekIndex: number): string {
  return `group-program-${programId}-w-${weekIndex}`;
}

function applySuggestedLoads(
  blocks: unknown[],
  loadByExerciseId: Map<string, number>,
): unknown[] {
  if (!Array.isArray(blocks) || loadByExerciseId.size === 0) return blocks;
  return blocks.map((block) => {
    if (!block || typeof block !== 'object') return block;
    const b = block as Record<string, unknown>;
    const exercises = Array.isArray(b.exercises) ? b.exercises : [];
    return {
      ...b,
      exercises: exercises.map((ex) => {
        if (!ex || typeof ex !== 'object') return ex;
        const e = ex as Record<string, unknown>;
        const exerciseId =
          typeof e.exerciseId === 'string' ? e.exerciseId.trim() : '';
        const currentLoad =
          typeof e.prescribedLoad === 'number' ? e.prescribedLoad : 0;
        const suggested = exerciseId ? loadByExerciseId.get(exerciseId) : undefined;
        if (suggested != null && suggested > 0 && currentLoad <= 0) {
          return { ...e, prescribedLoad: suggested };
        }
        return e;
      }),
    };
  });
}

@Injectable()
export class GroupProgramService {
  constructor(
    @InjectRepository(STPGroupProgram)
    private readonly programRepo: Repository<STPGroupProgram>,
    @InjectRepository(STPGroupProgramSlot)
    private readonly slotRepo: Repository<STPGroupProgramSlot>,
    @InjectRepository(STPGroupProgramEnrollment)
    private readonly enrollRepo: Repository<STPGroupProgramEnrollment>,
    @InjectRepository(STPSessionInstance)
    private readonly sessionRepo: Repository<STPSessionInstance>,
    @InjectRepository(STPWorkoutTemplate)
    private readonly templateRepo: Repository<STPWorkoutTemplate>,
    @Inject(forwardRef(() => TrainingPlannerService))
    private readonly planner: TrainingPlannerService,
  ) {}

  async listPrograms(companyId: string) {
    const rows = await this.programRepo.find({
      where: { companyId },
      order: { updatedAt: 'DESC' },
    });
    const counts = await this.enrollRepo
      .createQueryBuilder('e')
      .select('e.program_id', 'programId')
      .addSelect('COUNT(*)', 'count')
      .where('e.status = :status', { status: 'active' })
      .groupBy('e.program_id')
      .getRawMany<{ programId: string; count: string }>();
    const countMap = new Map(counts.map((c) => [c.programId, Number(c.count)]));
    return rows.map((p) => this.serializeProgram(p, countMap.get(p.id) ?? 0));
  }

  async getProgramDetail(companyId: string, programId: string) {
    const program = await this.requireProgram(companyId, programId);
    const [slots, enrollments] = await Promise.all([
      this.slotRepo.find({
        where: { programId },
        order: { weekIndex: 'ASC', sessionOrdinal: 'ASC' },
      }),
      this.enrollRepo.find({ where: { programId, status: 'active' } }),
    ]);
    return {
      ...this.serializeProgram(program, enrollments.length),
      slots: slots.map((s) => this.serializeSlot(s)),
      enrollments: enrollments.map((e) => ({
        id: e.id,
        athleteId: e.athleteId,
        startWeekIndex: e.startWeekIndex,
        trainingDays: e.trainingDays ?? [],
        status: e.status,
        enrolledAt: e.enrolledAt.toISOString(),
      })),
    };
  }

  async createProgram(companyId: string, dto: CreateGroupProgramDto, actor: User) {
    const sessionsPerWeek = dto.sessionsPerWeek;
    this.validateSessionsPerWeek(sessionsPerWeek);
    const trainingDays =
      dto.trainingDays && dto.trainingDays.length > 0
        ? this.normalizeAthleteTrainingDays(dto.trainingDays, sessionsPerWeek)
        : defaultTrainingDaysForFrequency(sessionsPerWeek);
    const entity = this.programRepo.create({
      companyId,
      name: dto.name.trim(),
      shortName: dto.shortName?.trim() || dto.name.trim().slice(0, 24),
      description: dto.description?.trim() || null,
      phase: dto.phase?.trim() || 'adaptacion',
      startDate: dto.startDate.slice(0, 10),
      weeksCount: dto.weeksCount,
      sessionsPerWeek,
      trainingDays,
      status: 'draft',
      createdByUserId: actor.id,
      createdByName: staffName(actor),
      lastEditedByUserId: actor.id,
      lastEditedByName: staffName(actor),
    });
    const saved = await this.programRepo.save(entity);
    return this.serializeProgram(saved, 0);
  }

  async updateProgram(
    companyId: string,
    programId: string,
    dto: UpdateGroupProgramDto,
    actor: User,
  ) {
    const entity = await this.requireProgram(companyId, programId);
    if (dto.sessionsPerWeek !== undefined) {
      this.validateSessionsPerWeek(dto.sessionsPerWeek);
      entity.sessionsPerWeek = dto.sessionsPerWeek;
    }
    if (dto.trainingDays) {
      entity.trainingDays = this.normalizeAthleteTrainingDays(
        dto.trainingDays,
        entity.sessionsPerWeek,
      );
    }
    if (dto.name !== undefined) entity.name = dto.name.trim();
    if (dto.shortName !== undefined) {
      entity.shortName = dto.shortName?.trim() || entity.name.slice(0, 24);
    }
    if (dto.description !== undefined) {
      entity.description = dto.description?.trim() || null;
    }
    if (dto.phase !== undefined) entity.phase = dto.phase.trim();
    if (dto.startDate !== undefined) entity.startDate = dto.startDate.slice(0, 10);
    const previousWeeks = entity.weeksCount;
    if (dto.weeksCount !== undefined) {
      if (!Number.isInteger(dto.weeksCount) || dto.weeksCount < 1 || dto.weeksCount > 52) {
        throw new BadRequestException('weeksCount debe ser 1–52.');
      }
      entity.weeksCount = dto.weeksCount;
    }
    if (dto.status !== undefined) entity.status = dto.status;
    entity.lastEditedByUserId = actor.id;
    entity.lastEditedByName = staffName(actor);
    const saved = await this.programRepo.save(entity);
    if (saved.weeksCount < previousWeeks) {
      await this.pruneWeeksBeyond(saved.id, saved.weeksCount);
    }
    await this.syncAllSessionsForProgram(saved.id, actor);
    return this.serializeProgram(saved, await this.countActiveEnrollments(saved.id));
  }

  /** Elimina slots (y sesiones no customizadas sin feedback) de semanas fuera de rango. */
  private async pruneWeeksBeyond(programId: string, weeksCount: number) {
    const excess = await this.slotRepo
      .createQueryBuilder('s')
      .where('s.program_id = :programId', { programId })
      .andWhere('s.week_index > :weeksCount', { weeksCount })
      .getMany();
    if (excess.length === 0) return;
    const removeIds = excess.map((s) => s.id);
    await this.sessionRepo
      .createQueryBuilder()
      .delete()
      .where('group_program_slot_id IN (:...removeIds)', { removeIds })
      .andWhere('is_customized = false')
      .andWhere('feedback_status = :none', { none: 'none' })
      .execute();
    await this.slotRepo.delete({ id: In(removeIds) });
  }

  async replaceSlots(
    companyId: string,
    programId: string,
    dto: ReplaceGroupProgramSlotsDto,
    actor: User,
  ) {
    const program = await this.requireProgram(companyId, programId);
    const maxOrdinal = program.sessionsPerWeek ?? 3;
    for (const slot of dto.slots) {
      if (slot.sessionOrdinal < 1 || slot.sessionOrdinal > maxOrdinal) {
        throw new BadRequestException(
          `sessionOrdinal debe estar entre 1 y ${maxOrdinal}.`,
        );
      }
      if (slot.weekIndex < 1 || slot.weekIndex > program.weeksCount) {
        throw new BadRequestException('weekIndex fuera del rango del mesociclo.');
      }
    }

    const templateIds = [...new Set(dto.slots.map((s) => s.workoutTemplateId))];
    const templates = await this.templateRepo.find({
      where: { id: In(templateIds), companyId, isActive: true },
    });
    if (templates.length !== templateIds.length) {
      throw new BadRequestException('Uno o más workouts no existen en este centro.');
    }

    const existing = await this.slotRepo.find({ where: { programId } });
    const key = (w: number, o: number) => `${w}:${o}`;
    const existingByKey = new Map(
      existing.map((s) => [key(s.weekIndex, s.sessionOrdinal), s]),
    );
    const seenKeys = new Set<string>();

    for (const input of dto.slots) {
      const k = key(input.weekIndex, input.sessionOrdinal);
      seenKeys.add(k);
      const prev = existingByKey.get(k);
      if (prev) {
        prev.workoutTemplateId = input.workoutTemplateId;
        prev.weekType = input.weekType ?? 'carga';
        prev.sessionOrdinal = input.sessionOrdinal;
        prev.dayOfWeek = input.dayOfWeek ?? null;
        prev.prescriptionOverrides = input.prescriptionOverrides ?? null;
        prev.notes = input.notes ?? null;
        await this.slotRepo.save(prev);
      } else {
        await this.slotRepo.save(
          this.slotRepo.create({
            programId,
            weekIndex: input.weekIndex,
            dayOfWeek: input.dayOfWeek ?? null,
            sessionOrdinal: input.sessionOrdinal,
            workoutTemplateId: input.workoutTemplateId,
            weekType: input.weekType ?? 'carga',
            prescriptionOverrides: input.prescriptionOverrides ?? null,
            notes: input.notes ?? null,
          }),
        );
      }
    }

    const toRemove = existing.filter(
      (s) => !seenKeys.has(key(s.weekIndex, s.sessionOrdinal)),
    );
    if (toRemove.length > 0) {
      const removeIds = toRemove.map((s) => s.id);
      await this.sessionRepo
        .createQueryBuilder()
        .delete()
        .where('group_program_slot_id IN (:...removeIds)', { removeIds })
        .andWhere('is_customized = false')
        .andWhere('feedback_status = :none', { none: 'none' })
        .execute();
      await this.slotRepo.delete({ id: In(removeIds) });
    }

    program.lastEditedByUserId = actor.id;
    program.lastEditedByName = staffName(actor);
    await this.programRepo.save(program);
    await this.syncAllSessionsForProgram(programId, actor);
    return this.getProgramDetail(companyId, programId);
  }

  async enrollAthletes(
    companyId: string,
    programId: string,
    dto: EnrollGroupProgramDto,
    actor: User,
  ) {
    const program = await this.requireProgram(companyId, programId);
    const startWeek = dto.startWeekIndex ?? 1;
    const maxSessions = program.sessionsPerWeek ?? 3;
    const batchDays = this.normalizeAthleteTrainingDays(
      dto.trainingDays,
      maxSessions,
    );
    const perAthleteMap = new Map(
      (dto.perAthlete ?? []).map((row) => [
        row.athleteId,
        this.normalizeAthleteTrainingDays(row.trainingDays, maxSessions),
      ]),
    );
    const uniqueIds = [...new Set(dto.athleteIds)];
    for (const athleteId of uniqueIds) {
      await this.planner.assertCanAccessTrainingAthlete(actor, athleteId, true);
      const trainingDays = perAthleteMap.get(athleteId) ?? batchDays;
      let row = await this.enrollRepo.findOne({
        where: { programId, athleteId },
      });
      if (!row) {
        row = this.enrollRepo.create({
          programId,
          athleteId,
          startWeekIndex: startWeek,
          trainingDays,
          status: 'active',
        });
      } else {
        row.status = 'active';
        row.startWeekIndex = Math.min(row.startWeekIndex, startWeek);
        row.trainingDays = trainingDays;
      }
      await this.enrollRepo.save(row);
      await this.materializeSessionsForAthlete(program, athleteId, actor);
      await this.syncLinkedSessionsForAthlete(program, athleteId, actor);
    }
    return this.getProgramDetail(companyId, programId);
  }

  async removeEnrollment(
    companyId: string,
    programId: string,
    athleteId: string,
    actor: User,
  ) {
    await this.requireProgram(companyId, programId);
    const row = await this.enrollRepo.findOne({
      where: { programId, athleteId, status: 'active' },
    });
    if (!row) throw new NotFoundException('Inscripción no encontrada');
    row.status = 'removed';
    await this.enrollRepo.save(row);
    const today = calendarDateInArgentina();
    await this.sessionRepo
      .createQueryBuilder()
      .delete()
      .where('group_program_id = :programId', { programId })
      .andWhere('athlete_id = :athleteId', { athleteId })
      .andWhere('scheduled_date >= :today', { today })
      .andWhere('athlete_completion_status = :pending', { pending: 'pending' })
      .andWhere('feedback_status = :none', { none: 'none' })
      .execute();
    return { ok: true };
  }

  async publishWeek(
    companyId: string,
    programId: string,
    weekIndex: number,
    actor: User,
  ) {
    await this.requireProgram(companyId, programId);
    const macroWeekId = macroWeekIdFor(programId, weekIndex);
    const sessions = await this.sessionRepo.find({
      where: { groupProgramId: programId, macroWeekId },
    });
    const results: { sessionId: string; ok: boolean; error?: string }[] = [];
    for (const session of sessions) {
      try {
        await this.planner.publishSession(session.id, session.athleteId, actor);
        results.push({ sessionId: session.id, ok: true });
      } catch (e) {
        results.push({
          sessionId: session.id,
          ok: false,
          error: e instanceof Error ? e.message : 'Error al publicar',
        });
      }
    }
    return { weekIndex, results, published: results.filter((r) => r.ok).length };
  }

  async getOverview(companyId: string, programId: string) {
    const program = await this.requireProgram(companyId, programId);
    const enrollments = await this.enrollRepo.find({
      where: { programId, status: 'active' },
    });
    const athleteIds = enrollments.map((e) => e.athleteId);
    if (athleteIds.length === 0) {
      return { program: this.serializeProgram(program, 0), weeks: [] };
    }
    const sessions = await this.sessionRepo.find({
      where: { groupProgramId: programId, athleteId: In(athleteIds) },
    });
    const byWeek = new Map<number, typeof sessions>();
    for (const s of sessions) {
      const match = s.macroWeekId.match(/-w-(\d+)$/);
      const w = match ? Number(match[1]) : 0;
      const list = byWeek.get(w) ?? [];
      list.push(s);
      byWeek.set(w, list);
    }
    const weeks = [...byWeek.entries()]
      .sort(([a], [b]) => a - b)
      .map(([weekIndex, list]) => ({
        weekIndex,
        sessions: list.map((s) => ({
          id: s.id,
          athleteId: s.athleteId,
          scheduledDate: s.scheduledDate,
          coachStatus: s.coachStatus,
          feedbackStatus: s.feedbackStatus,
          athleteCompletionStatus: s.athleteCompletionStatus,
          safetyConflictCount: Array.isArray(s.safetyConflicts)
            ? s.safetyConflicts.length
            : 0,
        })),
      }));
    return {
      program: this.serializeProgram(program, enrollments.length),
      weeks,
    };
  }

  async loadGroupProgramMeta(
    programIds: string[],
  ): Promise<
    Map<
      string,
      {
        id: string;
        name: string;
        shortName: string;
        phase: string;
        weeksCount: number;
      }
    >
  > {
    const map = new Map<
      string,
      {
        id: string;
        name: string;
        shortName: string;
        phase: string;
        weeksCount: number;
      }
    >();
    if (programIds.length === 0) return map;
    const programs = await this.programRepo.find({
      where: { id: In(programIds) },
    });
    for (const p of programs) {
      map.set(p.id, {
        id: p.id,
        name: p.name,
        shortName: p.shortName ?? p.name.slice(0, 24),
        phase: p.phase,
        weeksCount: p.weeksCount,
      });
    }
    return map;
  }

  groupProgramContextFromSession(
    e: STPSessionInstance,
    meta: {
      id: string;
      name: string;
      shortName: string;
      phase: string;
      weeksCount: number;
    } | undefined,
  ) {
    if (!e.groupProgramId || !meta) return null;
    const match = e.macroWeekId.match(/-w-(\d+)$/);
    const weekIndex = match ? Number(match[1]) : null;
    return {
      id: meta.id,
      name: meta.name,
      shortName: meta.shortName,
      phase: meta.phase,
      weekIndex,
      weeksCount: meta.weeksCount,
    };
  }

  private async requireProgram(companyId: string, programId: string) {
    const program = await this.programRepo.findOne({
      where: { id: programId, companyId },
    });
    if (!program) throw new NotFoundException('Programa no encontrado');
    return program;
  }

  private validateSessionsPerWeek(n: number) {
    if (!Number.isInteger(n) || n < 2 || n > 5) {
      throw new BadRequestException('sessionsPerWeek debe ser 2–5.');
    }
  }

  /** Ordena, dedupe y acota a sessionsPerWeek. */
  private normalizeAthleteTrainingDays(
    days: number[],
    sessionsPerWeek: number,
  ): number[] {
    const unique = [
      ...new Set(
        (days ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6),
      ),
    ].sort((a, b) => a - b);
    if (unique.length === 0) {
      throw new BadRequestException(
        'trainingDays debe incluir al menos un día (0–6).',
      );
    }
    if (unique.length > sessionsPerWeek) {
      return unique.slice(0, sessionsPerWeek);
    }
    return unique;
  }

  private resolveAthleteTrainingDays(
    enrollment: STPGroupProgramEnrollment,
    program: STPGroupProgram,
  ): number[] {
    const fromEnrollment = enrollment.trainingDays ?? [];
    if (fromEnrollment.length > 0) {
      return this.normalizeAthleteTrainingDays(
        fromEnrollment,
        program.sessionsPerWeek ?? 3,
      );
    }
    const fallback =
      program.trainingDays?.length > 0
        ? program.trainingDays
        : defaultTrainingDaysForFrequency(program.sessionsPerWeek ?? 3);
    return this.normalizeAthleteTrainingDays(
      fallback,
      program.sessionsPerWeek ?? 3,
    );
  }

  private async countActiveEnrollments(programId: string): Promise<number> {
    return this.enrollRepo.count({
      where: { programId, status: 'active' },
    });
  }

  private serializeProgram(p: STPGroupProgram, enrolledCount: number) {
    const sessionsPerWeek = p.sessionsPerWeek ?? 3;
    return {
      id: p.id,
      companyId: p.companyId,
      name: p.name,
      shortName: p.shortName ?? p.name.slice(0, 24),
      description: p.description,
      phase: p.phase,
      startDate:
        typeof p.startDate === 'string'
          ? p.startDate.slice(0, 10)
          : String(p.startDate).slice(0, 10),
      weeksCount: p.weeksCount,
      sessionsPerWeek,
      trainingDays: p.trainingDays ?? defaultTrainingDaysForFrequency(sessionsPerWeek),
      status: p.status,
      enrolledCount,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  }

  private serializeSlot(s: STPGroupProgramSlot) {
    return {
      id: s.id,
      programId: s.programId,
      weekIndex: s.weekIndex,
      dayOfWeek: s.dayOfWeek,
      sessionOrdinal: s.sessionOrdinal,
      workoutTemplateId: s.workoutTemplateId,
      weekType: s.weekType,
      prescriptionOverrides: s.prescriptionOverrides,
      notes: s.notes,
    };
  }

  private async syncAllSessionsForProgram(programId: string, actor: User) {
    const enrollments = await this.enrollRepo.find({
      where: { programId, status: 'active' },
    });
    const program = await this.programRepo.findOne({ where: { id: programId } });
    if (!program) return;
    for (const e of enrollments) {
      await this.materializeSessionsForAthlete(program, e.athleteId, actor);
      await this.syncLinkedSessionsForAthlete(program, e.athleteId, actor);
    }
  }

  private async materializeSessionsForAthlete(
    program: STPGroupProgram,
    athleteId: string,
    actor: User,
  ) {
    const enrollment = await this.enrollRepo.findOne({
      where: { programId: program.id, athleteId, status: 'active' },
    });
    if (!enrollment) return;

    const slots = await this.slotRepo.find({
      where: { programId: program.id },
      order: { weekIndex: 'ASC', sessionOrdinal: 'ASC' },
    });
    const templateIds = [...new Set(slots.map((s) => s.workoutTemplateId))];
    const templates = await this.templateRepo.find({
      where: { id: In(templateIds) },
    });
    const templateMap = new Map(templates.map((t) => [t.id, t]));
    const loadMap = await this.buildLoadMapForAthlete(athleteId);
    const startDate =
      typeof program.startDate === 'string'
        ? program.startDate.slice(0, 10)
        : String(program.startDate).slice(0, 10);
    const athleteDays = this.resolveAthleteTrainingDays(enrollment, program);

    const toSave: STPSessionInstance[] = [];

    for (const slot of slots) {
      if (slot.weekIndex < enrollment.startWeekIndex) continue;
      if (slot.sessionOrdinal > athleteDays.length) continue;
      const existing = await this.sessionRepo.findOne({
        where: {
          athleteId,
          groupProgramSlotId: slot.id,
        },
      });
      if (existing) continue;

      const template = templateMap.get(slot.workoutTemplateId);
      if (!template) continue;

      const scheduledDate = scheduledDateForAthleteSlot(
        startDate,
        slot.weekIndex,
        slot.sessionOrdinal,
        athleteDays,
      );
      if (!scheduledDate) continue;
      const weekStartDate = weekStartDateForProgram(startDate, slot.weekIndex);
      const weekLabel = `Microciclo ${slot.weekIndex} de ${program.weeksCount}`;
      let blocks = this.planner.cloneSessionBlocks(
        Array.isArray(template.blocks) ? template.blocks : [],
      );
      blocks = applySuggestedLoads(blocks, loadMap);
      const safety = await this.planner.evaluateSessionBlocksSafety(
        athleteId,
        blocks,
      );

      const entity = this.sessionRepo.create({
        id: `session-${randomUUID()}`,
        athleteId,
        macroPlanId: null,
        macroWeekId: macroWeekIdFor(program.id, slot.weekIndex),
        weekStartDate,
        weekLabel,
        sessionOrdinal: slot.sessionOrdinal,
        scheduledDate,
        phase: program.phase,
        weekType: slot.weekType,
        pattern: template.pattern ?? 'libre',
        templateId: 'group-program',
        templateDayId: slot.id,
        enduranceFormat: template.enduranceFormat,
        enduranceConfig: template.enduranceConfig,
        progressionConfig: null,
        warnings: mergeSessionWarnings([], safety.warnings),
        blocks,
        feedbackStatus: 'none',
        feedback: null,
        review: null,
        athleteCompletionStatus: 'pending',
        coachStatus: safety.conflicts.length > 0 ? 'draft' : 'draft',
        sourceWorkoutTemplateId: template.id,
        safetyConflicts: safety.conflicts,
        groupProgramId: program.id,
        groupProgramSlotId: slot.id,
        isCustomized: false,
        notes: null,
        coachObservations: null,
        createdByUserId: actor.id,
        createdByName: staffName(actor),
        lastSavedByUserId: actor.id,
        lastSavedByName: staffName(actor),
      });
      toSave.push(entity);
    }

    if (toSave.length > 0) {
      await this.sessionRepo.save(toSave);
    }
  }

  private async syncLinkedSessionsForAthlete(
    program: STPGroupProgram,
    athleteId: string,
    actor: User,
  ) {
    const today = calendarDateInArgentina();
    const sessions = await this.sessionRepo.find({
      where: {
        groupProgramId: program.id,
        athleteId,
        isCustomized: false,
      },
    });
    const enrollment = await this.enrollRepo.findOne({
      where: { programId: program.id, athleteId, status: 'active' },
    });
    if (!enrollment) return;
    const athleteDays = this.resolveAthleteTrainingDays(enrollment, program);

    const slots = await this.slotRepo.find({ where: { programId: program.id } });
    const slotMap = new Map(slots.map((s) => [s.id, s]));
    const templateIds = [...new Set(slots.map((s) => s.workoutTemplateId))];
    const templates = await this.templateRepo.find({
      where: { id: In(templateIds) },
    });
    const templateMap = new Map(templates.map((t) => [t.id, t]));
    const loadMap = await this.buildLoadMapForAthlete(athleteId);
    const startDate =
      typeof program.startDate === 'string'
        ? program.startDate.slice(0, 10)
        : String(program.startDate).slice(0, 10);

    for (const session of sessions) {
      if (session.scheduledDate < today) continue;
      if (session.feedbackStatus !== 'none' || session.feedback) continue;
      if (session.athleteCompletionStatus !== 'pending') continue;
      const slot = session.groupProgramSlotId
        ? slotMap.get(session.groupProgramSlotId)
        : undefined;
      if (!slot) continue;
      if (slot.sessionOrdinal > athleteDays.length) {
        await this.sessionRepo.delete({ id: session.id });
        continue;
      }
      const template = templateMap.get(slot.workoutTemplateId);
      if (!template) continue;

      const scheduledDate = scheduledDateForAthleteSlot(
        startDate,
        slot.weekIndex,
        slot.sessionOrdinal,
        athleteDays,
      );
      if (!scheduledDate) {
        await this.sessionRepo.delete({ id: session.id });
        continue;
      }

      let blocks = this.planner.cloneSessionBlocks(
        Array.isArray(template.blocks) ? template.blocks : [],
      );
      blocks = applySuggestedLoads(blocks, loadMap);
      const safety = await this.planner.evaluateSessionBlocksSafety(
        athleteId,
        blocks,
      );
      session.blocks = blocks;
      session.scheduledDate = scheduledDate;
      session.weekStartDate = weekStartDateForProgram(startDate, slot.weekIndex);
      session.sessionOrdinal = slot.sessionOrdinal;
      session.weekLabel = `Microciclo ${slot.weekIndex} de ${program.weeksCount}`;
      session.phase = program.phase;
      session.weekType = slot.weekType;
      session.pattern = template.pattern ?? 'libre';
      session.enduranceFormat = template.enduranceFormat;
      session.enduranceConfig = template.enduranceConfig;
      session.sourceWorkoutTemplateId = template.id;
      session.warnings = mergeSessionWarnings(session.warnings ?? [], safety.warnings);
      session.safetyConflicts = safety.conflicts;
      if (safety.conflicts.length > 0) {
        session.coachStatus = 'draft';
      }
      session.lastSavedByUserId = actor.id;
      session.lastSavedByName = staffName(actor);
      await this.sessionRepo.save(session);
    }
  }

  private async buildLoadMapForAthlete(
    athleteId: string,
  ): Promise<Map<string, number>> {
    const history = await this.planner.getExerciseHistory(athleteId, true);
    const map = new Map<string, number>();
    const exercises = history.exercises ?? {};
    for (const row of Object.values(exercises)) {
      if (row.lastLoad != null && row.lastLoad > 0) {
        map.set(row.exerciseId, row.lastLoad);
      }
    }
    return map;
  }
}
