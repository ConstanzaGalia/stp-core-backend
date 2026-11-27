import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import { LessThan, MoreThan, QueryFailedError, Repository } from 'typeorm';
import { DemoLead } from 'src/entities/demo-lead.entity';
import { DemoLeadEvent } from 'src/entities/demo-lead-event.entity';
import { DemoLeadAttempt } from 'src/entities/demo-lead-attempt.entity';
import { User } from 'src/entities/user.entity';
import { UserRole } from 'src/common/enums/enums';
import { demoLeadNotificationEmail } from 'src/utils/emailTemplates';
import { MailingService } from '../mailer/mailing.service';
import { MetaCapiService } from './meta-capi.service';
import {
  advanceDemoLeadStatus,
  DEMO_LEAD_MAX_EVENTS,
  DEMO_LEAD_RATE_LIMIT,
  DEMO_LEAD_TOKEN_TTL_MS,
  DemoLeadEventType,
  DemoLeadPlan,
  DemoLeadStatus,
  META_EVENT_NAMES,
  parseDemoLeadPlan,
} from './demo-leads.constants';
import {
  CreateDemoLeadDto,
  ListDemoLeadsQueryDto,
  TrackDemoEventDto,
} from './dto/demo-leads.dto';
import { buildWhatsAppLink, normalizePhoneAR } from './phone-ar.util';
import { createDemoLeadToken, hashIp, verifyDemoLeadToken } from './demo-token.util';

export interface DemoRequestContext {
  ip: string | null;
  userAgent: string | null;
}

export interface DemoLeadView {
  id: string;
  email: string;
  phone: string;
  whatsappUrl: string;
  name: string | null;
  gymName: string | null;
  planInterest: DemoLeadPlan | null;
  selectedPlan: DemoLeadPlan | null;
  status: DemoLeadStatus;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  referrer: string | null;
  landingUrl: string | null;
  consentAt: Date;
  consentTextVersion: string;
  statusChangedAt: Date | null;
  demoCompletedAt: Date | null;
  wantsToStartAt: Date | null;
  lastSeenAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const PLAN_LABELS: Record<DemoLeadPlan, string> = {
  [DemoLeadPlan.PERSONAL]: 'STP Personal',
  [DemoLeadPlan.CENTER]: 'STP Center',
};

const UNIQUE_VIOLATION = '23505';

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error as QueryFailedError & { driverError?: { code?: string } }).driverError?.code ===
      UNIQUE_VIOLATION
  );
}

/** Id de evento para Meta cuando el navegador no mandó uno. */
const newEventId = () => randomUUID().replace(/-/g, '');

@Injectable()
export class DemoLeadsService {
  private readonly logger = new Logger(DemoLeadsService.name);

  constructor(
    @InjectRepository(DemoLead)
    private readonly leadRepo: Repository<DemoLead>,
    @InjectRepository(DemoLeadEvent)
    private readonly eventRepo: Repository<DemoLeadEvent>,
    @InjectRepository(DemoLeadAttempt)
    private readonly attemptRepo: Repository<DemoLeadAttempt>,
    private readonly config: ConfigService,
    private readonly mailingService: MailingService,
    private readonly metaCapi: MetaCapiService,
  ) {}

  /** Alta pública de lead. Si el email ya existe, actualiza en lugar de duplicar. */
  async createLead(dto: CreateDemoLeadDto, ctx: DemoRequestContext): Promise<{ token: string }> {
    const secret = this.tokenSecret();
    await this.assertWithinRateLimit(hashIp(ctx.ip || 'unknown', secret));

    if (dto.website?.trim()) {
      // Bot: respondemos igual que a una persona, sin guardar nada.
      this.logger.warn('Alta de lead descartada por campo trampa');
      return { token: createDemoLeadToken(randomUUID(), secret, DEMO_LEAD_TOKEN_TTL_MS) };
    }

    const phoneE164 = normalizePhoneAR(dto.phone);
    if (!phoneE164) {
      // El DTO ya lo valida; esto cubre llamadas internas.
      throw new HttpException('El teléfono no es válido.', HttpStatus.BAD_REQUEST);
    }

    const now = new Date();
    const { lead, isNew } = await this.upsertLead(dto, phoneE164, now);

    const eventId = dto.eventId ?? newEventId();
    await this.insertEvent(lead, DemoLeadEventType.LEAD_CAPTURED, null, eventId);

    if (isNew) {
      void this.notifyNewLead(lead);
    }
    void this.metaCapi.sendEvent({
      eventName: META_EVENT_NAMES[DemoLeadEventType.LEAD_CAPTURED],
      eventId,
      eventSourceUrl: dto.pageUrl ?? lead.landingUrl,
      email: lead.email,
      phoneE164: lead.phoneE164,
      clientIp: ctx.ip,
      userAgent: ctx.userAgent,
      fbp: dto.fbp,
      fbc: dto.fbc,
    });

    return { token: createDemoLeadToken(lead.id, secret, DEMO_LEAD_TOKEN_TTL_MS) };
  }

  /** Evento del embudo reportado por el navegador. Idempotente por `eventId`. */
  async trackEvent(dto: TrackDemoEventDto, ctx: DemoRequestContext): Promise<{ ok: true }> {
    const leadId = verifyDemoLeadToken(dto.token, this.tokenSecret());
    const lead = leadId ? await this.leadRepo.findOne({ where: { id: leadId } }) : null;
    if (!lead) {
      throw new UnauthorizedException('La sesión de la demo venció. Volvé a completar el formulario.');
    }

    const eventCount = await this.eventRepo.count({ where: { lead: { id: lead.id } } });
    if (eventCount >= DEMO_LEAD_MAX_EVENTS) {
      return { ok: true };
    }

    const eventId = dto.eventId ?? newEventId();
    const inserted = await this.insertEvent(lead, dto.type, dto.step ?? null, eventId);
    if (!inserted) {
      return { ok: true };
    }

    const now = new Date();
    const previousStatus = lead.status;

    if (dto.type === DemoLeadEventType.DEMO_STEP_VIEWED) {
      lead.status = advanceDemoLeadStatus(lead.status, DemoLeadStatus.DEMO_VIEWED);
    } else if (dto.type === DemoLeadEventType.DEMO_COMPLETED) {
      lead.status = advanceDemoLeadStatus(lead.status, DemoLeadStatus.DEMO_VIEWED);
      lead.demoCompletedAt = lead.demoCompletedAt ?? now;
    } else if (dto.type === DemoLeadEventType.START_CLICKED) {
      lead.status = advanceDemoLeadStatus(lead.status, DemoLeadStatus.WANTS_TO_START);
      lead.selectedPlan = dto.plan ?? lead.selectedPlan;
      lead.wantsToStartAt = now;
    }

    if (lead.status !== previousStatus) lead.statusChangedAt = now;
    lead.lastSeenAt = now;
    await this.leadRepo.save(lead);

    if (dto.type === DemoLeadEventType.DEMO_COMPLETED) {
      void this.metaCapi.sendEvent({
        eventName: META_EVENT_NAMES[DemoLeadEventType.DEMO_COMPLETED],
        eventId,
        eventSourceUrl: dto.pageUrl ?? lead.landingUrl,
        email: lead.email,
        phoneE164: lead.phoneE164,
        clientIp: ctx.ip,
        userAgent: ctx.userAgent,
        fbp: dto.fbp,
        fbc: dto.fbc,
      });
    }

    return { ok: true };
  }

  async listLeads(
    user: User,
    query: ListDemoLeadsQueryDto,
  ): Promise<{ items: DemoLeadView[]; total: number; page: number; limit: number }> {
    this.assertCommercial(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;

    const qb = this.leadRepo.createQueryBuilder('lead').orderBy('lead.createdAt', 'DESC');
    if (query.status) {
      qb.andWhere('lead.status = :status', { status: query.status });
    }
    if (query.q) {
      qb.andWhere(
        '(lead.email ILIKE :q OR lead.name ILIKE :q OR lead.gymName ILIKE :q OR lead.phoneE164 ILIKE :q)',
        { q: `%${query.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%` },
      );
    }
    const [rows, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { items: rows.map(toDemoLeadView), total, page, limit };
  }

  async updateStatus(user: User, id: string, status: DemoLeadStatus): Promise<DemoLeadView> {
    this.assertCommercial(user);
    const lead = await this.leadRepo.findOne({ where: { id } });
    if (!lead) throw new NotFoundException('Lead no encontrado');
    if (lead.status !== status) {
      lead.status = status;
      lead.statusChangedAt = new Date();
      await this.leadRepo.save(lead);
    }
    return toDemoLeadView(lead);
  }

  /** Purga diaria de intentos viejos (solo sirven para la ventana del límite). */
  @Cron('0 4 * * *')
  async purgeOldAttempts(): Promise<void> {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    try {
      await this.attemptRepo.delete({ createdAt: LessThan(cutoff) });
    } catch (error) {
      this.logger.warn(`No se pudieron purgar intentos de demo: ${(error as Error)?.message}`);
    }
  }

  private async assertWithinRateLimit(ipHash: string): Promise<void> {
    const since = new Date(Date.now() - DEMO_LEAD_RATE_LIMIT.windowMs);
    const recent = await this.attemptRepo.count({
      where: { ipHash, createdAt: MoreThan(since) },
    });
    if (recent >= DEMO_LEAD_RATE_LIMIT.max) {
      throw new HttpException(
        'Recibimos demasiados intentos desde tu conexión. Probá de nuevo en unos minutos.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    await this.attemptRepo.insert({ ipHash });
  }

  private async upsertLead(
    dto: CreateDemoLeadDto,
    phoneE164: string,
    now: Date,
  ): Promise<{ lead: DemoLead; isNew: boolean }> {
    const existing = await this.leadRepo.findOne({ where: { email: dto.email } });
    if (existing) {
      return { lead: await this.leadRepo.save(applyLeadSubmission(existing, dto, phoneE164, now)), isNew: false };
    }

    const fresh = applyLeadSubmission(
      this.leadRepo.create({
        email: dto.email,
        status: DemoLeadStatus.NEW,
        source: 'demo',
        selectedPlan: null,
        statusChangedAt: null,
        demoCompletedAt: null,
        wantsToStartAt: null,
      }),
      dto,
      phoneE164,
      now,
    );
    try {
      return { lead: await this.leadRepo.save(fresh), isNew: true };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Dos envíos simultáneos del mismo email: el otro ganó, actualizamos ese.
      const winner = await this.leadRepo.findOne({ where: { email: dto.email } });
      if (!winner) throw error;
      return { lead: await this.leadRepo.save(applyLeadSubmission(winner, dto, phoneE164, now)), isNew: false };
    }
  }

  /** Devuelve `false` si el `eventId` ya estaba registrado. */
  private async insertEvent(
    lead: DemoLead,
    eventType: DemoLeadEventType,
    step: string | null,
    eventId: string,
  ): Promise<boolean> {
    try {
      await this.eventRepo.insert({ lead: { id: lead.id }, eventType, step, eventId });
      return true;
    } catch (error) {
      if (isUniqueViolation(error)) return false;
      throw error;
    }
  }

  private async notifyNewLead(lead: DemoLead): Promise<void> {
    const recipients = (this.config.get<string>('DEMO_LEADS_NOTIFY_EMAIL') ?? '')
      .split(',')
      .map((email) => email.trim())
      .filter(Boolean);
    if (recipients.length === 0) {
      this.logger.warn('DEMO_LEADS_NOTIFY_EMAIL no está configurado: no se avisó del lead nuevo');
      return;
    }

    const frontendUrl = (this.config.get<string>('FRONTEND_URL') ?? '').replace(/\/+$/, '');
    const from = this.config.get<string>('RESEND_FROM_EMAIL') ?? '';
    const sourceLabel =
      [lead.utmSource, lead.utmMedium, lead.utmCampaign].filter(Boolean).join(' / ') || null;

    for (const to of recipients) {
      try {
        await this.mailingService.sendMail(
          demoLeadNotificationEmail({
            to,
            from,
            email: lead.email,
            phoneE164: lead.phoneE164,
            whatsappUrl: buildWhatsAppLink(lead.phoneE164),
            name: lead.name,
            gymName: lead.gymName,
            planLabel: lead.planInterest ? PLAN_LABELS[lead.planInterest] : null,
            sourceLabel,
            adminUrl: `${frontendUrl}/admin/leads`,
          }),
        );
      } catch (error) {
        this.logger.error(`No se pudo avisar del lead nuevo a ${to}`, error as Error);
      }
    }
  }

  private assertCommercial(user: User | undefined): void {
    if (user?.role !== UserRole.STP_ADMIN && user?.role !== UserRole.STP_SALES) {
      throw new ForbiddenException('Solo el equipo comercial de STP puede ver los leads de la demo.');
    }
  }

  private tokenSecret(): string {
    const secret =
      this.config.get<string>('DEMO_LEAD_TOKEN_SECRET')?.trim() ||
      this.config.get<string>('SECRET_JWT')?.trim();
    if (!secret) {
      throw new InternalServerErrorException('Falta configurar DEMO_LEAD_TOKEN_SECRET o SECRET_JWT');
    }
    return secret;
  }
}

/**
 * Aplica un envío del formulario sobre un lead (nuevo o existente).
 * Datos de contacto y consentimiento: se actualizan. Origen comercial (UTM,
 * referrer, URL): se conserva el primero. El estado no se toca.
 */
export function applyLeadSubmission(
  lead: DemoLead,
  dto: CreateDemoLeadDto,
  phoneE164: string,
  now: Date,
): DemoLead {
  lead.phoneE164 = phoneE164;
  lead.phoneRaw = dto.phone;
  if (dto.name) lead.name = dto.name;
  if (dto.gymName) lead.gymName = dto.gymName;
  lead.name = lead.name ?? null;
  lead.gymName = lead.gymName ?? null;

  const plan = parseDemoLeadPlan(dto.plan);
  if (plan) lead.planInterest = plan;
  lead.planInterest = lead.planInterest ?? null;

  lead.utmSource = lead.utmSource ?? dto.utmSource ?? null;
  lead.utmMedium = lead.utmMedium ?? dto.utmMedium ?? null;
  lead.utmCampaign = lead.utmCampaign ?? dto.utmCampaign ?? null;
  lead.utmContent = lead.utmContent ?? dto.utmContent ?? null;
  lead.utmTerm = lead.utmTerm ?? dto.utmTerm ?? null;
  lead.referrer = lead.referrer ?? dto.referrer ?? null;
  lead.landingUrl = lead.landingUrl ?? dto.pageUrl ?? null;

  lead.consentContact = true;
  lead.consentAt = now;
  lead.consentTextVersion = dto.consentTextVersion;
  lead.lastSeenAt = now;
  return lead;
}

export function toDemoLeadView(lead: DemoLead): DemoLeadView {
  return {
    id: lead.id,
    email: lead.email,
    phone: lead.phoneE164,
    whatsappUrl: buildWhatsAppLink(lead.phoneE164),
    name: lead.name,
    gymName: lead.gymName,
    planInterest: lead.planInterest,
    selectedPlan: lead.selectedPlan,
    status: lead.status,
    utmSource: lead.utmSource,
    utmMedium: lead.utmMedium,
    utmCampaign: lead.utmCampaign,
    utmContent: lead.utmContent,
    utmTerm: lead.utmTerm,
    referrer: lead.referrer,
    landingUrl: lead.landingUrl,
    consentAt: lead.consentAt,
    consentTextVersion: lead.consentTextVersion,
    statusChangedAt: lead.statusChangedAt,
    demoCompletedAt: lead.demoCompletedAt,
    wantsToStartAt: lead.wantsToStartAt,
    lastSeenAt: lead.lastSeenAt,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
  };
}
