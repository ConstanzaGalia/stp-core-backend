import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { LessThan, MoreThan, QueryFailedError, Repository } from 'typeorm';
import { UserRole } from 'src/common/enums/enums';
import { AthleteProgramLead } from 'src/entities/athlete-program-lead.entity';
import { AthleteProgramLeadAttempt } from 'src/entities/athlete-program-lead-attempt.entity';
import { User } from 'src/entities/user.entity';
import { athleteProgramLeadNotificationEmail } from 'src/utils/emailTemplates';
import { hashIp } from '../demo-leads/demo-token.util';
import { buildWhatsAppLink, normalizePhoneAR } from '../demo-leads/phone-ar.util';
import { MailingService } from '../mailer/mailing.service';
import {
  ATHLETE_PROGRAM_LEAD_RATE_LIMIT,
  AthleteProgramLeadStatus,
  AthleteProgramModality,
} from './athlete-program-leads.constants';
import {
  CreateAthleteProgramLeadDto,
  ListAthleteProgramLeadsQueryDto,
} from './dto/athlete-program-leads.dto';

export interface AthleteProgramRequestContext {
  ip: string | null;
}

export interface AthleteProgramLeadView {
  id: string;
  email: string;
  phone: string;
  whatsappUrl: string;
  name: string;
  modality: AthleteProgramModality;
  programInterest: string | null;
  message: string | null;
  status: AthleteProgramLeadStatus;
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
  lastSeenAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const MODALITY_LABELS: Record<AthleteProgramModality, string> = {
  [AthleteProgramModality.ONLINE]: 'Programa online',
  [AthleteProgramModality.PRESENCIAL]: 'Gimnasio presencial',
};

const UNIQUE_VIOLATION = '23505';

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error as QueryFailedError & { driverError?: { code?: string } }).driverError?.code ===
      UNIQUE_VIOLATION
  );
}

@Injectable()
export class AthleteProgramLeadsService {
  private readonly logger = new Logger(AthleteProgramLeadsService.name);

  constructor(
    @InjectRepository(AthleteProgramLead)
    private readonly leadRepo: Repository<AthleteProgramLead>,
    @InjectRepository(AthleteProgramLeadAttempt)
    private readonly attemptRepo: Repository<AthleteProgramLeadAttempt>,
    private readonly config: ConfigService,
    private readonly mailingService: MailingService,
  ) {}

  async createLead(
    dto: CreateAthleteProgramLeadDto,
    ctx: AthleteProgramRequestContext,
  ): Promise<{ ok: true }> {
    const secret = this.config.get<string>('SECRET_JWT')?.trim() || 'athlete-program-leads';
    await this.assertWithinRateLimit(hashIp(ctx.ip || 'unknown', secret));

    if (dto.website?.trim()) {
      this.logger.warn('Alta de interesado descartada por campo trampa');
      return { ok: true };
    }

    const phoneE164 = normalizePhoneAR(dto.phone);
    if (!phoneE164) {
      throw new HttpException('El teléfono no es válido.', HttpStatus.BAD_REQUEST);
    }

    const { lead, isNew } = await this.upsertLead(dto, phoneE164, new Date());
    if (isNew) void this.notifyNewLead(lead);
    return { ok: true };
  }

  async listLeads(
    user: User,
    query: ListAthleteProgramLeadsQueryDto,
  ): Promise<{ items: AthleteProgramLeadView[]; total: number; page: number; limit: number }> {
    this.assertCommercial(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;

    const qb = this.leadRepo.createQueryBuilder('lead').orderBy('lead.createdAt', 'DESC');
    if (query.status) qb.andWhere('lead.status = :status', { status: query.status });
    if (query.modality) qb.andWhere('lead.modality = :modality', { modality: query.modality });
    if (query.q) {
      qb.andWhere(
        '(lead.email ILIKE :q OR lead.name ILIKE :q OR lead.programInterest ILIKE :q OR lead.phoneE164 ILIKE :q)',
        { q: `%${query.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%` },
      );
    }
    const [rows, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { items: rows.map(toAthleteProgramLeadView), total, page, limit };
  }

  async updateStatus(
    user: User,
    id: string,
    status: AthleteProgramLeadStatus,
  ): Promise<AthleteProgramLeadView> {
    this.assertCommercial(user);
    const lead = await this.leadRepo.findOne({ where: { id } });
    if (!lead) throw new NotFoundException('Interesado no encontrado');
    if (lead.status !== status) {
      lead.status = status;
      lead.statusChangedAt = new Date();
      await this.leadRepo.save(lead);
    }
    return toAthleteProgramLeadView(lead);
  }

  @Cron('15 4 * * *')
  async purgeOldAttempts(): Promise<void> {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    try {
      await this.attemptRepo.delete({ createdAt: LessThan(cutoff) });
    } catch (error) {
      this.logger.warn(
        `No se pudieron purgar intentos de atletas: ${(error as Error)?.message}`,
      );
    }
  }

  private async assertWithinRateLimit(ipHash: string): Promise<void> {
    const since = new Date(Date.now() - ATHLETE_PROGRAM_LEAD_RATE_LIMIT.windowMs);
    const recent = await this.attemptRepo.count({
      where: { ipHash, createdAt: MoreThan(since) },
    });
    if (recent >= ATHLETE_PROGRAM_LEAD_RATE_LIMIT.max) {
      throw new HttpException(
        'Recibimos demasiados intentos desde tu conexión. Probá de nuevo en unos minutos.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    await this.attemptRepo.insert({ ipHash });
  }

  private async upsertLead(
    dto: CreateAthleteProgramLeadDto,
    phoneE164: string,
    now: Date,
  ): Promise<{ lead: AthleteProgramLead; isNew: boolean }> {
    const existing = await this.leadRepo.findOne({ where: { email: dto.email } });
    if (existing) {
      return {
        lead: await this.leadRepo.save(applySubmission(existing, dto, phoneE164, now)),
        isNew: false,
      };
    }

    const fresh = applySubmission(
      this.leadRepo.create({
        email: dto.email,
        status: AthleteProgramLeadStatus.NEW,
        source: 'soy-atleta',
        statusChangedAt: null,
      }),
      dto,
      phoneE164,
      now,
    );
    try {
      return { lead: await this.leadRepo.save(fresh), isNew: true };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const winner = await this.leadRepo.findOne({ where: { email: dto.email } });
      if (!winner) throw error;
      return {
        lead: await this.leadRepo.save(applySubmission(winner, dto, phoneE164, now)),
        isNew: false,
      };
    }
  }

  private async notifyNewLead(lead: AthleteProgramLead): Promise<void> {
    const raw =
      this.config.get<string>('ATHLETE_PROGRAM_LEADS_NOTIFY_EMAIL') ||
      this.config.get<string>('DEMO_LEADS_NOTIFY_EMAIL') ||
      '';
    const recipients = raw
      .split(',')
      .map((email) => email.trim())
      .filter(Boolean);
    if (recipients.length === 0) {
      this.logger.warn(
        'ATHLETE_PROGRAM_LEADS_NOTIFY_EMAIL y DEMO_LEADS_NOTIFY_EMAIL no están configurados: no se avisó del interesado',
      );
      return;
    }

    const frontendUrl = (this.config.get<string>('FRONTEND_URL') ?? '').replace(/\/+$/, '');
    const from = this.config.get<string>('RESEND_FROM_EMAIL') ?? '';
    const sourceLabel =
      [lead.utmSource, lead.utmMedium, lead.utmCampaign].filter(Boolean).join(' / ') || null;

    for (const to of recipients) {
      try {
        await this.mailingService.sendMail(
          athleteProgramLeadNotificationEmail({
            to,
            from,
            email: lead.email,
            phoneE164: lead.phoneE164,
            whatsappUrl: buildWhatsAppLink(lead.phoneE164),
            name: lead.name,
            modalityLabel: MODALITY_LABELS[lead.modality],
            programInterest: lead.programInterest,
            message: lead.message,
            sourceLabel,
            adminUrl: `${frontendUrl}/admin/leads-atletas`,
          }),
        );
      } catch (error) {
        this.logger.error(`No se pudo avisar del interesado nuevo a ${to}`, error as Error);
      }
    }
  }

  private assertCommercial(user: User | undefined): void {
    if (user?.role !== UserRole.STP_ADMIN && user?.role !== UserRole.STP_SALES) {
      throw new ForbiddenException('Solo el equipo comercial de STP puede ver los interesados en entrenar.');
    }
  }
}

/**
 * Aplica un envío sobre un interesado (nuevo o existente).
 * Contacto, modalidad y programa se actualizan. El origen se conserva.
 * El estado no se toca: un reenvío no saca a alguien de "inscripto".
 */
export function applySubmission(
  lead: AthleteProgramLead,
  dto: CreateAthleteProgramLeadDto,
  phoneE164: string,
  now: Date,
): AthleteProgramLead {
  lead.phoneE164 = phoneE164;
  lead.phoneRaw = dto.phone;
  lead.name = dto.name;
  lead.modality = dto.modality;
  if (dto.programInterest) lead.programInterest = dto.programInterest;
  lead.programInterest = lead.programInterest ?? null;
  if (dto.message) lead.message = dto.message;
  lead.message = lead.message ?? null;

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

export function toAthleteProgramLeadView(lead: AthleteProgramLead): AthleteProgramLeadView {
  return {
    id: lead.id,
    email: lead.email,
    phone: lead.phoneE164,
    whatsappUrl: buildWhatsAppLink(lead.phoneE164),
    name: lead.name,
    modality: lead.modality,
    programInterest: lead.programInterest,
    message: lead.message,
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
    lastSeenAt: lead.lastSeenAt,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
  };
}
