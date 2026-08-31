import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from 'src/entities/user.entity';
import { BiomechanicalScreeningProtocol } from 'src/entities/biomechanical-screening-protocol.entity';
import { BiomechanicalScreeningSession } from 'src/entities/biomechanical-screening-session.entity';
import { BiomechanicalScreeningTestResult } from 'src/entities/biomechanical-screening-test-result.entity';
import { PhysicalEvaluationService } from '../physical-evaluation/physical-evaluation.service';
import {
  SCREENING_PROTOCOL_CODE,
  SCREENING_PROTOCOL_VERSION,
  STP_FUNCTIONAL_SCREENING_V1,
  type ScreeningProtocolDefinition,
} from './protocol/stp-functional-screening.v1';
import { ScreeningScoringService } from './screening-scoring.service';
import { ScreeningBiomechanicalProfileService } from './screening-biomechanical-profile.service';
import type { SaveTestPayload } from './screening.types';
import {
  calendarDateInArgentina,
  parseDateOnlyLocal,
  toDateOnlyKey,
} from 'src/common/utils/date-only.util';

@Injectable()
export class BiomechanicalScreeningService implements OnModuleInit {
  private readonly logger = new Logger(BiomechanicalScreeningService.name);

  constructor(
    @InjectRepository(BiomechanicalScreeningProtocol)
    private readonly protocolRepo: Repository<BiomechanicalScreeningProtocol>,
    @InjectRepository(BiomechanicalScreeningSession)
    private readonly sessionRepo: Repository<BiomechanicalScreeningSession>,
    @InjectRepository(BiomechanicalScreeningTestResult)
    private readonly testRepo: Repository<BiomechanicalScreeningTestResult>,
    private readonly scoring: ScreeningScoringService,
    private readonly biomechanicalProfile: ScreeningBiomechanicalProfileService,
    private readonly physicalEvaluations: PhysicalEvaluationService,
  ) {}

  async onModuleInit() {
    try {
      await this.ensureProtocolSeed();
    } catch (error) {
      this.logger.warn(
        `No se pudo sembrar el protocolo de screening. Ejecutá la migración 1750500000000 o sql/create-biomechanical-screening.sql. ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }

  async ensureProtocolSeed(): Promise<void> {
    const existing = await this.protocolRepo.findOne({
      where: { code: SCREENING_PROTOCOL_CODE, version: SCREENING_PROTOCOL_VERSION },
    });
    if (existing) {
      existing.name = STP_FUNCTIONAL_SCREENING_V1.name;
      existing.definition = STP_FUNCTIONAL_SCREENING_V1;
      existing.active = true;
      await this.protocolRepo.save(existing);
      return;
    }
    await this.protocolRepo.save(
      this.protocolRepo.create({
        code: SCREENING_PROTOCOL_CODE,
        version: SCREENING_PROTOCOL_VERSION,
        name: STP_FUNCTIONAL_SCREENING_V1.name,
        definition: STP_FUNCTIONAL_SCREENING_V1,
        active: true,
      }),
    );
  }

  async getActiveProtocol(): Promise<BiomechanicalScreeningProtocol> {
    const protocol = await this.protocolRepo.findOne({
      where: { code: SCREENING_PROTOCOL_CODE, version: SCREENING_PROTOCOL_VERSION, active: true },
    });
    if (!protocol) {
      await this.ensureProtocolSeed();
      const created = await this.protocolRepo.findOne({
        where: { code: SCREENING_PROTOCOL_CODE, version: SCREENING_PROTOCOL_VERSION },
      });
      if (!created) throw new NotFoundException('Protocolo de screening no disponible');
      return created;
    }
    return protocol;
  }

  getProtocolDefinition(): ScreeningProtocolDefinition {
    return STP_FUNCTIONAL_SCREENING_V1;
  }

  async listForAthlete(actor: User, athleteUserId: string) {
    await this.physicalEvaluations.assertCanAccessAthlete(actor, athleteUserId, false);
    const sessions = await this.sessionRepo.find({
      where: { user: { id: athleteUserId } },
      relations: ['evaluator', 'tests'],
      order: { evaluationDate: 'DESC', createdAt: 'DESC' },
    });
    return sessions.map((session) => this.toListItem(session));
  }

  async getSession(actor: User, athleteUserId: string, sessionId: string) {
    const session = await this.loadSession(athleteUserId, sessionId);
    await this.physicalEvaluations.assertCanAccessAthlete(actor, session.user.id, false);
    return this.toDetail(session);
  }

  async createSession(
    actor: User,
    athleteUserId: string,
    dto: { evaluationDate?: string; notes?: string },
  ) {
    const athlete = await this.physicalEvaluations.assertCanAccessAthlete(actor, athleteUserId, true);
    const protocol = await this.getActiveProtocol();
    const definition = protocol.definition ?? STP_FUNCTIONAL_SCREENING_V1;
    const evaluationDate = this.parseEvaluationDate(dto.evaluationDate);

    const session = this.sessionRepo.create({
      user: athlete,
      evaluator: actor,
      protocol,
      evaluationDate,
      status: 'draft',
      currentTestCode: definition.tests[0]?.code ?? null,
      notes: dto.notes ?? null,
      protocolSnapshot: definition,
      findings: [],
      painAlerts: [],
      tests: definition.tests.map((test) =>
        this.testRepo.create({
          testCode: test.code,
          sortOrder: test.sortOrder,
          status: 'pending',
          observations: {},
          compensations: [],
          invalidReasons: [],
          maxScore: test.maxScore,
        }),
      ),
    });

    const saved = await this.sessionRepo.save(session);
    return this.getSession(actor, athleteUserId, saved.id);
  }

  async saveTest(
    actor: User,
    athleteUserId: string,
    sessionId: string,
    testCode: string,
    payload: SaveTestPayload,
  ) {
    const session = await this.loadSession(athleteUserId, sessionId);
    await this.physicalEvaluations.assertCanAccessAthlete(actor, session.user.id, true);
    if (session.status === 'completed') {
      throw new BadRequestException('La sesión ya está completada y no se puede modificar');
    }

    const definition = session.protocolSnapshot ?? STP_FUNCTIONAL_SCREENING_V1;
    const test = session.tests.find((item) => item.testCode === testCode);
    if (!test) throw new NotFoundException(`Test ${testCode} no pertenece a esta sesión`);
    this.assertTestPayload(definition, testCode, payload);

    this.scoring.applySavePayload(test, definition, payload);
    await this.testRepo.save(test);

    const nextPending = [...session.tests]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .find((item) => item.status !== 'saved' && item.testCode !== testCode);
    session.status = 'in_progress';
    session.currentTestCode = nextPending?.testCode ?? testCode;
    this.refreshReports(session, definition);
    await this.sessionRepo.save(session);

    return this.getSession(actor, athleteUserId, sessionId);
  }

  async completeSession(
    actor: User,
    athleteUserId: string,
    sessionId: string,
    notes?: string,
  ) {
    const session = await this.loadSession(athleteUserId, sessionId);
    await this.physicalEvaluations.assertCanAccessAthlete(actor, session.user.id, true);
    if (session.status === 'completed') {
      throw new BadRequestException('La sesión ya está completada');
    }

    const pending = session.tests.filter((test) => test.status !== 'saved');
    if (pending.length > 0) {
      throw new BadRequestException(
        `Faltan tests por guardar: ${pending.map((test) => test.testCode).join(', ')}`,
      );
    }

    const definition = session.protocolSnapshot ?? STP_FUNCTIONAL_SCREENING_V1;
    if (notes !== undefined) session.notes = notes;
    session.status = 'completed';
    session.completedAt = new Date();
    this.refreshReports(session, definition);
    await this.sessionRepo.save(session);
    return this.getSession(actor, athleteUserId, sessionId);
  }

  async updateProgress(
    actor: User,
    athleteUserId: string,
    sessionId: string,
    dto: { notes?: string; currentTestCode?: string },
  ) {
    const session = await this.loadSession(athleteUserId, sessionId);
    await this.physicalEvaluations.assertCanAccessAthlete(actor, session.user.id, true);
    if (session.status === 'completed') {
      throw new BadRequestException('La sesión ya está completada');
    }
    if (dto.notes !== undefined) session.notes = dto.notes;
    if (dto.currentTestCode) session.currentTestCode = dto.currentTestCode;
    await this.sessionRepo.save(session);
    return this.getSession(actor, athleteUserId, sessionId);
  }

  async removeSession(actor: User, athleteUserId: string, sessionId: string) {
    const session = await this.loadSession(athleteUserId, sessionId);
    await this.physicalEvaluations.assertCanAccessAthlete(actor, session.user.id, true);
    await this.sessionRepo.remove(session);
    return { deleted: true };
  }

  private assertTestPayload(
    definition: ScreeningProtocolDefinition,
    testCode: string,
    payload: SaveTestPayload,
  ) {
    const testDef = definition.tests.find((item) => item.code === testCode);
    if (!testDef) throw new NotFoundException(`Test ${testCode} no existe en el protocolo`);
    const allowed = new Set(definition.observationOptions.map((item) => item.code));

    const assertOptions = (observations: Record<string, string> | undefined, label: string) => {
      if (!observations) throw new BadRequestException(`Faltan observaciones de ${label}`);
      for (const criterion of testDef.criteria) {
        const option = observations[criterion.code];
        if (!option) {
          throw new BadRequestException(`Falta la observación "${criterion.label}" en ${label}`);
        }
        if (!allowed.has(option as (typeof definition.observationOptions)[number]['code'])) {
          throw new BadRequestException(`Observación inválida en ${criterion.label}`);
        }
      }
    };

    if (testDef.scoringMode === 'quantitative') {
      if (payload.quantitative?.leftCm == null || payload.quantitative?.rightCm == null) {
        throw new BadRequestException('Registrá la distancia de ambos tobillos en centímetros');
      }
      return;
    }
    if (testDef.scoringMode === 'criteria_bilateral') {
      assertOptions(payload.sideObservations?.left, 'izquierda');
      assertOptions(payload.sideObservations?.right, 'derecha');
      return;
    }
    assertOptions(payload.observations, testDef.name);
  }

  private parseEvaluationDate(isoOrYmd?: string): Date {
    const parsed = parseDateOnlyLocal(isoOrYmd ?? calendarDateInArgentina());
    if (!parsed) throw new BadRequestException('evaluationDate inválida');
    parsed.setHours(12, 0, 0, 0);
    return parsed;
  }

  private formatEvaluationDate(value: Date | string | null | undefined): string {
    return toDateOnlyKey(value) ?? String(value ?? '').slice(0, 10);
  }

  private refreshReports(session: BiomechanicalScreeningSession, definition: ScreeningProtocolDefinition) {
    const date = this.formatEvaluationDate(session.evaluationDate);
    const computed = this.scoring.buildReports(definition, session.tests, date, session.notes);
    session.summaryReport = computed.summaryReport;
    session.fullReport = computed.fullReport;
    session.findings = computed.findings;
    session.painAlerts = computed.painAlerts;
  }

  private async loadSession(athleteUserId: string, sessionId: string) {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId, user: { id: athleteUserId } },
      relations: ['user', 'evaluator', 'protocol', 'tests'],
    });
    if (!session) throw new NotFoundException('Sesión de screening no encontrada');
    session.tests = [...(session.tests ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
    return session;
  }

  private toListItem(session: BiomechanicalScreeningSession) {
    const savedCount = (session.tests ?? []).filter((test) => test.status === 'saved').length;
    const totalCount = (session.tests ?? []).length;
    const summaryReport = this.ensureBiomechanicalProfile(session, session.summaryReport);
    return {
      id: session.id,
      evaluationDate: this.formatEvaluationDate(session.evaluationDate),
      status: session.status,
      currentTestCode: session.currentTestCode,
      savedCount,
      totalCount,
      painAlertsCount: session.painAlerts?.length ?? 0,
      summaryReport,
      evaluatorName: session.evaluator
        ? `${session.evaluator.name} ${session.evaluator.lastName}`.trim()
        : null,
      createdAt: session.createdAt,
      completedAt: session.completedAt,
    };
  }

  private toDetail(session: BiomechanicalScreeningSession) {
    const definition =
      session.status === 'completed'
        ? session.protocolSnapshot ?? STP_FUNCTIONAL_SCREENING_V1
        : STP_FUNCTIONAL_SCREENING_V1;
    const summaryReport = this.ensureBiomechanicalProfile(session, session.summaryReport);
    const fullReport = session.fullReport
      ? {
          ...session.fullReport,
          summary: summaryReport ?? session.fullReport.summary,
        }
      : session.fullReport;
    return {
      session: {
        id: session.id,
        athleteId: session.user.id,
        athleteName: `${session.user.name} ${session.user.lastName}`.trim(),
        evaluatorId: session.evaluator?.id ?? null,
        evaluatorName: session.evaluator
          ? `${session.evaluator.name} ${session.evaluator.lastName}`.trim()
          : null,
        evaluationDate: this.formatEvaluationDate(session.evaluationDate),
        status: session.status,
        currentTestCode: session.currentTestCode,
        notes: session.notes,
        completedAt: session.completedAt,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      },
      protocol: definition,
      tests: session.tests,
      summaryReport,
      fullReport,
      findings: session.findings ?? [],
      painAlerts: session.painAlerts ?? [],
    };
  }

  private ensureBiomechanicalProfile(
    session: BiomechanicalScreeningSession,
    summaryReport: BiomechanicalScreeningSession['summaryReport'],
  ) {
    if (!summaryReport) return summaryReport;
    if (summaryReport.biomechanicalProfile?.axes?.length) return summaryReport;

    const definition =
      session.status === 'completed'
        ? session.protocolSnapshot ?? STP_FUNCTIONAL_SCREENING_V1
        : STP_FUNCTIONAL_SCREENING_V1;
    const biomechanicalProfile = this.biomechanicalProfile.buildProfile(
      definition,
      session.tests ?? [],
    );

    return {
      ...summaryReport,
      biomechanicalProfile,
    };
  }
}
