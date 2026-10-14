import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { assertStpPlatformOperator } from 'src/common/helpers/company-access.helper';
import {
  StpPlatformBillingKind,
  StpPlatformChargeConcept,
  StpPlatformChargeStatus,
  StpPlatformPlan,
  StpPlatformSubscriptionStatus,
  UserRole,
} from 'src/common/enums/enums';
import { Company } from 'src/entities/company.entity';
import { StpPlatformCharge } from 'src/entities/stp-platform-charge.entity';
import { StpPlatformSubscription } from 'src/entities/stp-platform-subscription.entity';
import { User } from 'src/entities/user.entity';
import { MailingService } from '../mailer/mailing.service';
import { platformSubscriptionRenewalEmail } from 'src/utils/emailTemplates';
import {
  AssignPlatformSubscriptionDto,
  AttachPlatformReceiptDto,
  CreatePlatformChargeDto,
  UpdatePlatformChargeDto,
  UpdatePlatformSubscriptionDto,
} from './dto/platform-billing.dto';

function toNumber(value: unknown): number {
  if (value == null) return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dateKey(value: string | Date | null | undefined): string | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function daysBetween(fromKey: string, toKey: string): number {
  const from = new Date(`${fromKey}T12:00:00.000Z`);
  const to = new Date(`${toKey}T12:00:00.000Z`);
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

/** Suma meses calendario y recorta al último día si el mes destino no tiene esa fecha. */
function addCalendarMonths(dateKeyValue: string, months: number): string {
  const [year, month, day] = dateKeyValue.split('-').map(Number);
  const targetIndex = month - 1 + months;
  const targetYear = year + Math.floor(targetIndex / 12);
  const targetMonth = ((targetIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const targetDay = Math.min(day, lastDay);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${targetYear}-${pad(targetMonth + 1)}-${pad(targetDay)}`;
}

function formatMoneyEs(amount: number, currency: string): string {
  const formatted = amount.toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${currency} ${formatted}`;
}

const RENEWAL_NOTICE_DAYS = 3;
const NEXT_CHARGE_LEAD_DAYS = 7;

const PLAN_LABELS: Record<StpPlatformPlan, string> = {
  [StpPlatformPlan.STP_PERSONAL]: 'STP Personal',
  [StpPlatformPlan.STP_CENTER]: 'STP Center',
  [StpPlatformPlan.STP_CLUB]: 'STP Club',
};

@Injectable()
export class StpPlatformBillingService {
  private readonly logger = new Logger(StpPlatformBillingService.name);

  constructor(
    @InjectRepository(StpPlatformSubscription)
    private readonly subscriptionRepo: Repository<StpPlatformSubscription>,
    @InjectRepository(StpPlatformCharge)
    private readonly chargeRepo: Repository<StpPlatformCharge>,
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    private readonly mailingService: MailingService,
  ) {}

  private async assertCompany(companyId: string): Promise<Company> {
    const company = await this.companyRepo.findOne({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Centro no encontrado');
    return company;
  }

  private serializeSubscription(sub: StpPlatformSubscription) {
    return {
      id: sub.id,
      companyId: sub.companyId,
      plan: sub.plan,
      billingKind: sub.billingKind,
      status: sub.status,
      subscriptionAmount:
        sub.subscriptionAmount == null ? null : toNumber(sub.subscriptionAmount),
      currency: sub.currency,
      periodStart: sub.periodStart,
      periodEnd: sub.periodEnd,
      notes: sub.notes,
      assignedByUserId: sub.assignedByUserId,
      createdAt: sub.createdAt,
      updatedAt: sub.updatedAt,
    };
  }

  private serializeCharge(charge: StpPlatformCharge) {
    return {
      id: charge.id,
      companyId: charge.companyId,
      subscriptionId: charge.subscriptionId,
      concept: charge.concept,
      amount: toNumber(charge.amount),
      currency: charge.currency,
      status: charge.status,
      dueDate: charge.dueDate,
      paidAt: charge.paidAt,
      method: charge.method,
      reference: charge.reference,
      notes: charge.notes,
      recordedByUserId: charge.recordedByUserId,
      receiptStorageKey: charge.receiptStorageKey,
      receiptFilename: charge.receiptFilename,
      receiptMimeType: charge.receiptMimeType,
      receiptUploadedAt: charge.receiptUploadedAt,
      createdAt: charge.createdAt,
      updatedAt: charge.updatedAt,
    };
  }

  async getActiveSubscriptionMap(
    companyIds: string[],
  ): Promise<Map<string, StpPlatformSubscription>> {
    const map = new Map<string, StpPlatformSubscription>();
    if (companyIds.length === 0) return map;
    const rows = await this.subscriptionRepo.find({
      where: {
        companyId: In(companyIds),
        status: StpPlatformSubscriptionStatus.ACTIVE,
      },
      order: { createdAt: 'DESC' },
    });
    for (const row of rows) {
      if (!map.has(row.companyId)) map.set(row.companyId, row);
    }
    return map;
  }

  async getChargeSummaryMap(companyIds: string[]): Promise<
    Map<
      string,
      {
        pendingSubscription: boolean;
        pendingOnboarding: boolean;
        onboardingPaid: boolean;
        overdue: boolean;
        receiptSubmitted: boolean;
        lastPaidAt: string | null;
        lastPaidAmount: number | null;
        lastPaidCurrency: string | null;
      }
    >
  > {
    const map = new Map<
      string,
      {
        pendingSubscription: boolean;
        pendingOnboarding: boolean;
        onboardingPaid: boolean;
        overdue: boolean;
        receiptSubmitted: boolean;
        lastPaidAt: string | null;
        lastPaidAmount: number | null;
        lastPaidCurrency: string | null;
      }
    >();
    for (const id of companyIds) {
      map.set(id, {
        pendingSubscription: false,
        pendingOnboarding: false,
        onboardingPaid: false,
        overdue: false,
        receiptSubmitted: false,
        lastPaidAt: null,
        lastPaidAmount: null,
        lastPaidCurrency: null,
      });
    }
    if (companyIds.length === 0) return map;

    const today = todayDateOnly();
    const charges = await this.chargeRepo.find({
      where: { companyId: In(companyIds) },
      order: { createdAt: 'DESC' },
    });

    for (const charge of charges) {
      const summary = map.get(charge.companyId);
      if (!summary) continue;
      if (charge.status === StpPlatformChargeStatus.PENDING) {
        if (charge.concept === StpPlatformChargeConcept.SUBSCRIPTION) {
          summary.pendingSubscription = true;
        }
        if (charge.concept === StpPlatformChargeConcept.ONBOARDING) {
          summary.pendingOnboarding = true;
        }
        if (charge.dueDate && charge.dueDate < today) {
          summary.overdue = true;
        }
        if (charge.receiptStorageKey) {
          summary.receiptSubmitted = true;
        }
      }
      if (
        charge.status === StpPlatformChargeStatus.PAID &&
        charge.concept === StpPlatformChargeConcept.ONBOARDING
      ) {
        summary.onboardingPaid = true;
      }
      if (
        charge.status === StpPlatformChargeStatus.PAID &&
        summary.lastPaidAt == null
      ) {
        summary.lastPaidAt = charge.paidAt
          ? new Date(charge.paidAt).toISOString()
          : null;
        summary.lastPaidAmount = toNumber(charge.amount);
        summary.lastPaidCurrency = charge.currency;
      }
    }
    return map;
  }

  async assignSubscription(
    companyId: string,
    dto: AssignPlatformSubscriptionDto,
    admin: User,
  ) {
    await assertStpPlatformOperator(admin, this.companyRepo);
    await this.assertCompany(companyId);

    if (dto.billingKind === StpPlatformBillingKind.PAID) {
      if (dto.subscriptionAmount == null || dto.subscriptionAmount < 0) {
        throw new BadRequestException(
          'La suscripción paga requiere un monto pactado',
        );
      }
      if (!dto.periodEnd) {
        throw new BadRequestException(
          'La suscripción paga requiere fecha de vencimiento',
        );
      }
    }

    await this.subscriptionRepo.update(
      {
        companyId,
        status: StpPlatformSubscriptionStatus.ACTIVE,
      },
      { status: StpPlatformSubscriptionStatus.EXPIRED },
    );

    const isFree = dto.billingKind === StpPlatformBillingKind.FREE;
    const currency = (dto.currency ?? 'ARS').toUpperCase();
    const subscription = this.subscriptionRepo.create({
      companyId,
      plan: dto.plan,
      billingKind: dto.billingKind,
      status: StpPlatformSubscriptionStatus.ACTIVE,
      subscriptionAmount: isFree ? null : dto.subscriptionAmount ?? null,
      currency,
      periodStart: dto.periodStart,
      periodEnd: isFree ? null : dto.periodEnd ?? null,
      notes: dto.notes ?? null,
      assignedByUserId: admin.id,
    });
    const saved = await this.subscriptionRepo.save(subscription);

    let charge: StpPlatformCharge | null = null;
    if (!isFree && toNumber(saved.subscriptionAmount) > 0) {
      const markPaid = dto.markSubscriptionPaid === true;
      charge = this.chargeRepo.create({
        companyId,
        subscriptionId: saved.id,
        concept: StpPlatformChargeConcept.SUBSCRIPTION,
        amount: saved.subscriptionAmount!,
        currency,
        status: markPaid
          ? StpPlatformChargeStatus.PAID
          : StpPlatformChargeStatus.PENDING,
        dueDate: saved.periodEnd,
        paidAt: markPaid ? new Date() : null,
        method: markPaid ? dto.paymentMethod ?? null : null,
        reference: markPaid ? dto.paymentReference ?? null : null,
        notes: null,
        recordedByUserId: admin.id,
      });
      charge = await this.chargeRepo.save(charge);
    }

    return {
      subscription: this.serializeSubscription(saved),
      charge: charge ? this.serializeCharge(charge) : null,
    };
  }

  async updateSubscription(
    subscriptionId: string,
    dto: UpdatePlatformSubscriptionDto,
    admin: User,
  ) {
    await assertStpPlatformOperator(admin, this.companyRepo);
    const sub = await this.subscriptionRepo.findOne({
      where: { id: subscriptionId },
    });
    if (!sub) throw new NotFoundException('Suscripción no encontrada');

    if (dto.status != null) sub.status = dto.status;
    if (dto.periodStart != null) sub.periodStart = dto.periodStart;
    if (dto.periodEnd !== undefined) {
      this.assignPeriodEnd(sub, dto.periodEnd);
    }
    if (dto.subscriptionAmount !== undefined) {
      sub.subscriptionAmount = dto.subscriptionAmount;
    }
    if (dto.currency != null) sub.currency = dto.currency.toUpperCase();
    if (dto.notes !== undefined) sub.notes = dto.notes;

    const saved = await this.subscriptionRepo.save(sub);
    return this.serializeSubscription(saved);
  }

  async listCharges(companyId: string, admin: User) {
    await assertStpPlatformOperator(admin, this.companyRepo);
    await this.assertCompany(companyId);
    const charges = await this.chargeRepo.find({
      where: { companyId },
      order: { createdAt: 'DESC' },
    });
    return charges.map((c) => this.serializeCharge(c));
  }

  async createCharge(
    companyId: string,
    dto: CreatePlatformChargeDto,
    admin: User,
  ) {
    await assertStpPlatformOperator(admin, this.companyRepo);
    await this.assertCompany(companyId);

    if (dto.subscriptionId) {
      const sub = await this.subscriptionRepo.findOne({
        where: { id: dto.subscriptionId, companyId },
      });
      if (!sub) {
        throw new BadRequestException(
          'La suscripción indicada no pertenece a este centro',
        );
      }
    }

    const status = dto.status ?? StpPlatformChargeStatus.PENDING;
    if (status === StpPlatformChargeStatus.PAID && !dto.method) {
      throw new BadRequestException('Indicá el método de pago');
    }

    let subscriptionId = dto.subscriptionId ?? null;
    if (
      !subscriptionId &&
      dto.concept === StpPlatformChargeConcept.SUBSCRIPTION
    ) {
      const active = await this.subscriptionRepo.findOne({
        where: {
          companyId,
          status: StpPlatformSubscriptionStatus.ACTIVE,
        },
        order: { createdAt: 'DESC' },
      });
      subscriptionId = active?.id ?? null;
    }

    const charge = this.chargeRepo.create({
      companyId,
      subscriptionId,
      concept: dto.concept,
      amount: dto.amount,
      currency: (dto.currency ?? 'ARS').toUpperCase(),
      status,
      dueDate: dto.dueDate ?? null,
      paidAt:
        status === StpPlatformChargeStatus.PAID
          ? dto.paidAt
            ? new Date(dto.paidAt)
            : new Date()
          : null,
      method: status === StpPlatformChargeStatus.PAID ? dto.method ?? null : null,
      reference: dto.reference ?? null,
      notes: dto.notes ?? null,
      recordedByUserId: admin.id,
    });

    const saved = await this.chargeRepo.save(charge);

    // Cuota de suscripción: actualizar vencimiento/precio del período vigente.
    if (
      dto.concept === StpPlatformChargeConcept.SUBSCRIPTION &&
      subscriptionId &&
      (dto.dueDate || dto.amount != null)
    ) {
      const sub = await this.subscriptionRepo.findOne({
        where: { id: subscriptionId },
      });
      if (sub && sub.status === StpPlatformSubscriptionStatus.ACTIVE) {
        if (dto.dueDate) this.assignPeriodEnd(sub, dto.dueDate);
        if (dto.amount != null) sub.subscriptionAmount = dto.amount;
        if (dto.currency) sub.currency = dto.currency.toUpperCase();
        await this.subscriptionRepo.save(sub);
      }
    }

    return this.serializeCharge(saved);
  }

  async updateCharge(
    chargeId: string,
    dto: UpdatePlatformChargeDto,
    admin: User,
  ) {
    await assertStpPlatformOperator(admin, this.companyRepo);
    const charge = await this.chargeRepo.findOne({ where: { id: chargeId } });
    if (!charge) throw new NotFoundException('Cargo no encontrado');

    if (dto.concept != null) charge.concept = dto.concept;
    if (dto.amount != null) charge.amount = dto.amount;
    if (dto.currency != null) charge.currency = dto.currency.toUpperCase();
    if (dto.dueDate !== undefined) charge.dueDate = dto.dueDate;
    if (dto.reference !== undefined) charge.reference = dto.reference;
    if (dto.notes !== undefined) charge.notes = dto.notes;
    if (dto.method !== undefined) charge.method = dto.method;

    if (
      charge.concept === StpPlatformChargeConcept.SUBSCRIPTION &&
      !charge.subscriptionId
    ) {
      const active = await this.subscriptionRepo.findOne({
        where: {
          companyId: charge.companyId,
          status: StpPlatformSubscriptionStatus.ACTIVE,
        },
        order: { createdAt: 'DESC' },
      });
      charge.subscriptionId = active?.id ?? null;
    }

    if (dto.status != null) {
      charge.status = dto.status;
      if (dto.status === StpPlatformChargeStatus.PAID) {
        if (!charge.method && !dto.method) {
          throw new BadRequestException('Indicá el método de pago');
        }
        charge.paidAt = dto.paidAt
          ? new Date(dto.paidAt)
          : charge.paidAt ?? new Date();
        if (dto.method) charge.method = dto.method;
      } else {
        charge.paidAt = null;
      }
    } else if (dto.paidAt !== undefined) {
      charge.paidAt = dto.paidAt ? new Date(dto.paidAt) : null;
    }

    const saved = await this.chargeRepo.save(charge);

    if (
      saved.concept === StpPlatformChargeConcept.SUBSCRIPTION &&
      saved.subscriptionId &&
      (saved.dueDate || saved.amount != null)
    ) {
      const sub = await this.subscriptionRepo.findOne({
        where: { id: saved.subscriptionId },
      });
      if (sub && sub.status === StpPlatformSubscriptionStatus.ACTIVE) {
        const rolledEnd = await this.periodEndAfterPayment(saved);
        if (rolledEnd) this.assignPeriodEnd(sub, rolledEnd);
        else if (saved.dueDate) this.assignPeriodEnd(sub, saved.dueDate);
        if (saved.amount != null) sub.subscriptionAmount = toNumber(saved.amount);
        if (saved.currency) sub.currency = saved.currency;
        await this.subscriptionRepo.save(sub);
      }
    }

    return this.serializeCharge(saved);
  }

  async deleteCharge(chargeId: string, admin: User) {
    await assertStpPlatformOperator(admin, this.companyRepo);
    const charge = await this.chargeRepo.findOne({ where: { id: chargeId } });
    if (!charge) throw new NotFoundException('Cargo no encontrado');
    await this.chargeRepo.remove(charge);
    return { deleted: true };
  }

  async getStats(admin: User) {
    await assertStpPlatformOperator(admin, this.companyRepo);
    const today = todayDateOnly();
    const in7 = addDays(today, 7);
    const in30 = addDays(today, 30);
    const yearStart = `${today.slice(0, 4)}-01-01`;
    const monthStart = `${today.slice(0, 7)}-01`;

    const activeSubs = await this.subscriptionRepo.find({
      where: { status: StpPlatformSubscriptionStatus.ACTIVE },
    });

    const freeCount = activeSubs.filter(
      (s) => s.billingKind === StpPlatformBillingKind.FREE,
    ).length;
    const paidCount = activeSubs.filter(
      (s) => s.billingKind === StpPlatformBillingKind.PAID,
    ).length;

    const byPlan: Record<string, number> = {
      [StpPlatformPlan.STP_PERSONAL]: 0,
      [StpPlatformPlan.STP_CENTER]: 0,
      [StpPlatformPlan.STP_CLUB]: 0,
    };
    for (const sub of activeSubs) {
      byPlan[sub.plan] = (byPlan[sub.plan] ?? 0) + 1;
    }

    const pendingCharges = await this.chargeRepo.find({
      where: { status: StpPlatformChargeStatus.PENDING },
    });

    const overdue = pendingCharges.filter(
      (c) => c.dueDate != null && c.dueDate < today,
    );
    const upcoming7 = pendingCharges.filter(
      (c) => c.dueDate != null && c.dueDate >= today && c.dueDate <= in7,
    );
    const upcoming30 = pendingCharges.filter(
      (c) => c.dueDate != null && c.dueDate >= today && c.dueDate <= in30,
    );

    const sumByCurrency = (rows: StpPlatformCharge[]) => {
      const map: Record<string, number> = {};
      for (const row of rows) {
        const cur = row.currency || 'ARS';
        map[cur] = (map[cur] ?? 0) + toNumber(row.amount);
      }
      return map;
    };

    const paidThisMonth = await this.chargeRepo
      .createQueryBuilder('c')
      .where('c.status = :status', { status: StpPlatformChargeStatus.PAID })
      .andWhere('c.paid_at >= :from', { from: new Date(`${monthStart}T00:00:00.000Z`) })
      .getMany();

    const paidThisYear = await this.chargeRepo
      .createQueryBuilder('c')
      .where('c.status = :status', { status: StpPlatformChargeStatus.PAID })
      .andWhere('c.paid_at >= :from', { from: new Date(`${yearStart}T00:00:00.000Z`) })
      .getMany();

    const splitConcepts = (rows: StpPlatformCharge[]) => {
      const subscription = rows.filter(
        (r) => r.concept === StpPlatformChargeConcept.SUBSCRIPTION,
      );
      const onboarding = rows.filter(
        (r) => r.concept === StpPlatformChargeConcept.ONBOARDING,
      );
      return {
        subscription: sumByCurrency(subscription),
        onboarding: sumByCurrency(onboarding),
        total: sumByCurrency(rows),
      };
    };

    return {
      activeSubscriptions: activeSubs.length,
      freeCount,
      paidCount,
      byPlan,
      pending: {
        count: pendingCharges.length,
        amounts: sumByCurrency(pendingCharges),
      },
      overdue: {
        count: overdue.length,
        amounts: sumByCurrency(overdue),
      },
      upcoming7: {
        count: upcoming7.length,
        amounts: sumByCurrency(upcoming7),
      },
      upcoming30: {
        count: upcoming30.length,
        amounts: sumByCurrency(upcoming30),
      },
      collectedMonth: splitConcepts(paidThisMonth),
      collectedYear: splitConcepts(paidThisYear),
    };
  }

  /** Filtro de vencimiento para listado de centros. */
  async filterCompanyIdsByDue(
    due: 'overdue' | 'upcoming' | undefined,
  ): Promise<string[] | null> {
    if (!due) return null;
    const today = todayDateOnly();
    const in30 = addDays(today, 30);

    const qb = this.chargeRepo
      .createQueryBuilder('c')
      .select('DISTINCT c.company_id', 'companyId')
      .where('c.status = :status', { status: StpPlatformChargeStatus.PENDING })
      .andWhere('c.due_date IS NOT NULL');

    if (due === 'overdue') {
      qb.andWhere('c.due_date < :today', { today });
    } else {
      qb.andWhere('c.due_date >= :today AND c.due_date <= :in30', {
        today,
        in30,
      });
    }

    const rows = await qb.getRawMany<{ companyId: string }>();
    return rows.map((r) => r.companyId);
  }

  async filterCompanyIdsByPlan(
    plan?: string,
    billingKind?: string,
  ): Promise<string[] | null> {
    if (!plan && !billingKind) return null;
    const where: Record<string, unknown> = {
      status: StpPlatformSubscriptionStatus.ACTIVE,
    };
    if (plan) where.plan = plan;
    if (billingKind) where.billingKind = billingKind;
    const rows = await this.subscriptionRepo.find({
      where: where as any,
      select: ['companyId'],
    });
    return rows.map((r) => r.companyId);
  }

  /** Vista de solo lectura para director/secretaría del centro. */
  async getCompanySubscriptionView(companyId: string, user: User) {
    await this.assertCanViewCompanySubscription(user, companyId);
    const today = todayDateOnly();

    const subscription = await this.subscriptionRepo.findOne({
      where: {
        companyId,
        status: StpPlatformSubscriptionStatus.ACTIVE,
      },
      order: { createdAt: 'DESC' },
    });

    const charges = await this.chargeRepo.find({
      where: { companyId },
      order: { createdAt: 'DESC' },
    });

    const pendingCharges = charges
      .filter((charge) => charge.status === StpPlatformChargeStatus.PENDING)
      .sort((a, b) => {
        const aKey = dateKey(a.dueDate) ?? '9999-12-31';
        const bKey = dateKey(b.dueDate) ?? '9999-12-31';
        return aKey.localeCompare(bKey);
      });
    const paidCharges = charges
      .filter((charge) => charge.status === StpPlatformChargeStatus.PAID)
      .slice(0, 12);

    const periodEnd =
      subscription?.billingKind === StpPlatformBillingKind.PAID
        ? dateKey(subscription.periodEnd)
        : null;
    const daysUntilExpiry =
      periodEnd == null ? null : daysBetween(today, periodEnd);
    const chargeOverdue = pendingCharges.some((charge) => {
      const due = dateKey(charge.dueDate);
      return due != null && due < today;
    });
    const periodOverdue = daysUntilExpiry != null && daysUntilExpiry < 0;

    return {
      subscription: subscription ? this.serializeSubscription(subscription) : null,
      pendingCharges: pendingCharges.map((charge) => this.serializeCharge(charge)),
      paidCharges: paidCharges.map((charge) => this.serializeCharge(charge)),
      daysUntilExpiry,
      expiresWithinDays:
        daysUntilExpiry != null &&
        daysUntilExpiry >= 0 &&
        daysUntilExpiry <= RENEWAL_NOTICE_DAYS,
      overdue: chargeOverdue || periodOverdue,
      hasPendingPayments: pendingCharges.length > 0,
    };
  }

  /** Adjunta el comprobante de un cargo pendiente. No cambia el estado de pago. */
  async attachReceipt(
    companyId: string,
    chargeId: string,
    dto: AttachPlatformReceiptDto,
    user: User,
  ) {
    await this.assertCanViewCompanySubscription(user, companyId);
    const charge = await this.chargeRepo.findOne({
      where: { id: chargeId, companyId },
    });
    if (!charge) throw new NotFoundException('Cargo no encontrado');
    if (charge.status !== StpPlatformChargeStatus.PENDING) {
      throw new BadRequestException(
        'Solo se puede adjuntar un comprobante a un pago pendiente',
      );
    }

    const prefix = `platform-receipts/${companyId}/${chargeId}/`;
    if (!dto.storageKey.startsWith(prefix) || dto.storageKey.includes('..')) {
      throw new BadRequestException('El comprobante no corresponde a este cargo');
    }

    charge.receiptStorageKey = dto.storageKey;
    charge.receiptFilename = dto.filename.trim();
    charge.receiptMimeType = dto.mimeType?.trim() || null;
    charge.receiptUploadedAt = new Date();
    const saved = await this.chargeRepo.save(charge);
    return this.serializeCharge(saved);
  }

  /** Crea el cobro del mes siguiente y después avisa si el período vence en 0–3 días. */
  @Cron('0 9 * * *', { timeZone: 'America/Argentina/Buenos_Aires' })
  async runDailyPlatformBilling(): Promise<void> {
    try {
      await this.createUpcomingSubscriptionCharges();
    } catch (error) {
      this.logger.error(
        'No se pudieron generar los cobros del mes siguiente',
        error instanceof Error ? error.stack : undefined,
      );
    }
    await this.sendUpcomingRenewalNotices();
  }

  /** Aviso diario a directores cuando el período vence en 0–3 días. */
  async sendUpcomingRenewalNotices(): Promise<void> {
    const today = todayDateOnly();
    const limit = addDays(today, RENEWAL_NOTICE_DAYS);
    const candidates = await this.subscriptionRepo.find({
      where: {
        status: StpPlatformSubscriptionStatus.ACTIVE,
        billingKind: StpPlatformBillingKind.PAID,
        renewalNoticeSentAt: IsNull(),
      },
    });
    const due = candidates.filter((sub) => {
      const end = dateKey(sub.periodEnd);
      return end != null && end >= today && end <= limit;
    });

    for (const sub of due) {
      try {
        await this.notifyRenewal(sub, today);
      } catch (error) {
        this.logger.error(
          `No se pudo avisar el vencimiento de la suscripción ${sub.id}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }
  }

  private async createUpcomingSubscriptionCharges(): Promise<void> {
    const today = todayDateOnly();
    const subscriptions = await this.subscriptionRepo.find({
      where: {
        status: StpPlatformSubscriptionStatus.ACTIVE,
        billingKind: StpPlatformBillingKind.PAID,
      },
    });

    for (const sub of subscriptions) {
      try {
        await this.ensureNextSubscriptionCharge(sub, today);
      } catch (error) {
        this.logger.error(
          `No se pudo crear el cobro siguiente de la suscripción ${sub.id}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }
  }

  private async ensureNextSubscriptionCharge(
    sub: StpPlatformSubscription,
    today: string,
  ): Promise<void> {
    const periodEnd = dateKey(sub.periodEnd);
    if (!periodEnd) return;
    if (toNumber(sub.subscriptionAmount) <= 0) return;
    if (daysBetween(today, periodEnd) > NEXT_CHARGE_LEAD_DAYS) return;

    const nextDue = addCalendarMonths(periodEnd, 1);
    const existing = await this.findSubscriptionChargeByDueDate(
      sub.companyId,
      nextDue,
    );
    if (existing) return;

    const charge = this.chargeRepo.create({
      companyId: sub.companyId,
      subscriptionId: sub.id,
      concept: StpPlatformChargeConcept.SUBSCRIPTION,
      amount: toNumber(sub.subscriptionAmount),
      currency: (sub.currency || 'ARS').toUpperCase(),
      status: StpPlatformChargeStatus.PENDING,
      dueDate: nextDue,
      paidAt: null,
      method: null,
      reference: null,
      notes: null,
      recordedByUserId: null,
    });
    await this.chargeRepo.save(charge);

    const currentPaid = await this.findSubscriptionChargeByDueDate(
      sub.companyId,
      periodEnd,
    );
    if (currentPaid?.status === StpPlatformChargeStatus.PAID) {
      this.assignPeriodEnd(sub, nextDue);
      await this.subscriptionRepo.save(sub);
    }
  }

  private async findSubscriptionChargeByDueDate(
    companyId: string,
    dueDate: string,
  ): Promise<StpPlatformCharge | null> {
    return this.chargeRepo
      .createQueryBuilder('c')
      .where('c.company_id = :companyId', { companyId })
      .andWhere('c.concept = :concept', {
        concept: StpPlatformChargeConcept.SUBSCRIPTION,
      })
      .andWhere('c.due_date = :dueDate', { dueDate })
      .getOne();
  }

  /** Si el cargo cobrado ya tiene el del mes siguiente, el período pasa a esa fecha. */
  private async periodEndAfterPayment(
    charge: StpPlatformCharge,
  ): Promise<string | null> {
    if (
      charge.status !== StpPlatformChargeStatus.PAID ||
      charge.concept !== StpPlatformChargeConcept.SUBSCRIPTION
    ) {
      return null;
    }
    const base = dateKey(charge.dueDate);
    if (!base) return null;
    const following = await this.findSubscriptionChargeByDueDate(
      charge.companyId,
      addCalendarMonths(base, 1),
    );
    return dateKey(following?.dueDate);
  }

  private assignPeriodEnd(
    sub: StpPlatformSubscription,
    next: string | Date | null,
  ): void {
    const nextKey = dateKey(next);
    const currentKey = dateKey(sub.periodEnd);
    if (nextKey !== currentKey) {
      sub.renewalNoticeSentAt = null;
    }
    sub.periodEnd = nextKey;
  }

  private async assertCanViewCompanySubscription(
    user: User | undefined,
    companyId: string,
  ): Promise<Company> {
    if (!user) throw new UnauthorizedException();
    const company = await this.companyRepo.findOne({
      where: { id: companyId },
      relations: ['users'],
    });
    if (!company) throw new NotFoundException('Centro no encontrado');
    if (user.role === UserRole.STP_ADMIN) return company;
    if (
      user.role !== UserRole.DIRECTOR &&
      user.role !== UserRole.SECRETARIA
    ) {
      throw new ForbiddenException(
        'No tenés permiso para ver la suscripción de este centro',
      );
    }
    const isMember = (company.users ?? []).some((member) => member.id === user.id);
    if (!isMember) {
      throw new ForbiddenException(
        'No tenés permiso para ver la suscripción de este centro',
      );
    }
    return company;
  }

  private async notifyRenewal(
    sub: StpPlatformSubscription,
    today: string,
  ): Promise<void> {
    const periodEnd = dateKey(sub.periodEnd);
    if (!periodEnd) return;

    const company = await this.companyRepo.findOne({
      where: { id: sub.companyId },
      relations: ['users'],
    });
    if (!company) return;

    const directors = (company.users ?? []).filter(
      (member) =>
        member.role === UserRole.DIRECTOR &&
        !!member.email?.trim() &&
        member.isDelete !== true,
    );

    if (directors.length === 0) {
      this.logger.warn(
        `Suscripción ${sub.id} sin directores con email; se marca el aviso para no reintentar`,
      );
      sub.renewalNoticeSentAt = new Date();
      await this.subscriptionRepo.save(sub);
      return;
    }

    const pending = await this.chargeRepo.find({
      where: {
        companyId: sub.companyId,
        status: StpPlatformChargeStatus.PENDING,
      },
    });
    const pendingLabel = this.formatPendingLabel(pending);
    const amountLabel =
      pendingLabel ??
      (sub.subscriptionAmount != null
        ? formatMoneyEs(toNumber(sub.subscriptionAmount), sub.currency || 'ARS')
        : null);
    const daysUntil = daysBetween(today, periodEnd);
    const periodEndLabel = new Date(`${periodEnd}T12:00:00.000Z`).toLocaleDateString(
      'es-AR',
      { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' },
    );
    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(
      /\/$/,
      '',
    );
    const from = process.env.RESEND_FROM_EMAIL || 'noreply@stp.com';

    let sent = 0;
    for (const director of directors) {
      try {
        const mail = platformSubscriptionRenewalEmail({
          email: director.email,
          name: director.name || 'Director',
          companyName: company.name,
          planLabel: PLAN_LABELS[sub.plan] ?? sub.plan,
          periodEndLabel,
          pendingAmountLabel: amountLabel,
          daysUntil,
          url: `${frontendUrl}/mi-suscripcion`,
          from,
        });
        await this.mailingService.sendMail(mail);
        sent += 1;
      } catch (error) {
        this.logger.error(
          `No se pudo enviar el aviso de suscripción a ${director.email}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    if (sent > 0) {
      sub.renewalNoticeSentAt = new Date();
      await this.subscriptionRepo.save(sub);
    }
  }

  private formatPendingLabel(charges: StpPlatformCharge[]): string | null {
    const totals = new Map<string, number>();
    for (const charge of charges) {
      const currency = charge.currency || 'ARS';
      totals.set(currency, (totals.get(currency) ?? 0) + toNumber(charge.amount));
    }
    if (totals.size === 0) return null;
    return Array.from(totals.entries())
      .map(([currency, amount]) => formatMoneyEs(amount, currency))
      .join(' · ');
  }
}
