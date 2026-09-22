import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { assertStpPlatformOperator } from 'src/common/helpers/company-access.helper';
import {
  StpPlatformBillingKind,
  StpPlatformChargeConcept,
  StpPlatformChargeStatus,
  StpPlatformPlan,
  StpPlatformSubscriptionStatus,
} from 'src/common/enums/enums';
import { Company } from 'src/entities/company.entity';
import { StpPlatformCharge } from 'src/entities/stp-platform-charge.entity';
import { StpPlatformSubscription } from 'src/entities/stp-platform-subscription.entity';
import { User } from 'src/entities/user.entity';
import {
  AssignPlatformSubscriptionDto,
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

@Injectable()
export class StpPlatformBillingService {
  constructor(
    @InjectRepository(StpPlatformSubscription)
    private readonly subscriptionRepo: Repository<StpPlatformSubscription>,
    @InjectRepository(StpPlatformCharge)
    private readonly chargeRepo: Repository<StpPlatformCharge>,
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
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
        overdue: boolean;
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
        overdue: boolean;
        lastPaidAt: string | null;
        lastPaidAmount: number | null;
        lastPaidCurrency: string | null;
      }
    >();
    for (const id of companyIds) {
      map.set(id, {
        pendingSubscription: false,
        pendingOnboarding: false,
        overdue: false,
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
    if (dto.periodEnd !== undefined) sub.periodEnd = dto.periodEnd;
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
        if (dto.dueDate) sub.periodEnd = dto.dueDate;
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

    if (dto.amount != null) charge.amount = dto.amount;
    if (dto.currency != null) charge.currency = dto.currency.toUpperCase();
    if (dto.dueDate !== undefined) charge.dueDate = dto.dueDate;
    if (dto.reference !== undefined) charge.reference = dto.reference;
    if (dto.notes !== undefined) charge.notes = dto.notes;
    if (dto.method !== undefined) charge.method = dto.method;

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
    return this.serializeCharge(saved);
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
}
