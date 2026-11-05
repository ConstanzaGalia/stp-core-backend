import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  SubscriptionStatus,
  UserPaymentSubscription,
} from '../../entities/user-payment-subscription.entity';

export interface PeriodCredits {
  consumidas: number;
  reservasPendientes: number;
  libres: number;
}

export interface PeriodCreditReservationRow {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  overlapsPlanillaDay: boolean;
}

export interface PeriodCreditsDetail extends PeriodCredits {
  periodStart: string;
  periodEnd: string;
  cupo: number;
  planillaDays: string[];
  pendingReservations: PeriodCreditReservationRow[];
  markedReservations: Array<{
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    attendanceStatus: boolean;
  }>;
  subscriptionId: string | null;
  planName: string | null;
}

interface ComputeInput {
  userId: string;
  companyId: string;
  periodStart: string;
  periodEnd: string;
  cupo: number;
}

/** Agrega contadores del período. Exportado para tests. */
export function aggregatePeriodCredits(
  marked: number,
  planilla: number,
  pending: number,
  cupo: number,
): PeriodCredits {
  const safeCupo = Math.max(0, Number(cupo) || 0);
  const consumidas = Math.min(safeCupo, marked + planilla);
  const reservasPendientes = Math.max(0, pending);
  const libres = Math.max(0, safeCupo - consumidas - reservasPendientes);
  return { consumidas, reservasPendientes, libres };
}

/**
 * Créditos del período:
 * - consumida: turno con asistencia marcada (presente o ausente), o presente en planilla
 *   de un día sin turno marcado.
 * - pendiente: reserva del período sin asistencia, excepto si ese mismo día ya hay
 *   planilla completada (evita doble conteo).
 * - libres: cupo − consumidas − pendientes (nunca negativo).
 */
@Injectable()
export class PeriodCreditsService {
  private readonly logger = new Logger(PeriodCreditsService.name);

  constructor(
    @InjectRepository(UserPaymentSubscription)
    private readonly subscriptionRepository: Repository<UserPaymentSubscription>,
  ) {}

  async compute(input: ComputeInput): Promise<PeriodCredits> {
    const cupo = Math.max(0, Number(input.cupo) || 0);
    const rows: Array<{ marked: number | string; planilla: number | string; pending: number | string }> =
      await this.subscriptionRepository.query(
        `
        SELECT
          (
            SELECT COUNT(*)::int
            FROM reservation r
            JOIN time_slot ts ON ts.id = r."timeSlotId"
            WHERE r."userId" = $1
              AND ts."companyId" = $2
              AND r.attendance_status IS NOT NULL
              AND ts.date::date BETWEEN $3::date AND $4::date
          ) AS marked,
          (
            SELECT COUNT(DISTINCT left(sess.scheduled_date, 10))::int
            FROM stp_session_instances sess
            WHERE sess.athlete_id = $1::text
              AND sess.athlete_completion_status = 'completed'
              AND left(sess.scheduled_date, 10)::date BETWEEN $3::date AND $4::date
              AND NOT EXISTS (
                SELECT 1
                FROM reservation r2
                JOIN time_slot ts2 ON ts2.id = r2."timeSlotId"
                WHERE r2."userId" = $1
                  AND ts2."companyId" = $2
                  AND r2.attendance_status IS NOT NULL
                  AND ts2.date::date = left(sess.scheduled_date, 10)::date
              )
          ) AS planilla,
          (
            SELECT COUNT(*)::int
            FROM reservation r3
            JOIN time_slot ts3 ON ts3.id = r3."timeSlotId"
            WHERE r3."userId" = $1
              AND ts3."companyId" = $2
              AND r3.attendance_status IS NULL
              AND ts3.date::date BETWEEN $3::date AND $4::date
              AND NOT EXISTS (
                SELECT 1
                FROM stp_session_instances sess3
                WHERE sess3.athlete_id = $1::text
                  AND sess3.athlete_completion_status = 'completed'
                  AND left(sess3.scheduled_date, 10)::date = ts3.date::date
              )
          ) AS pending
        `,
        [input.userId, input.companyId, input.periodStart, input.periodEnd],
      );

    return aggregatePeriodCredits(
      Number(rows[0]?.marked ?? 0),
      Number(rows[0]?.planilla ?? 0),
      Number(rows[0]?.pending ?? 0),
      cupo,
    );
  }

  /** Recalcula la suscripción activa y persiste usados/restantes. */
  async syncActiveSubscriptionCredits(
    userId: string,
    companyId?: string | null,
  ): Promise<PeriodCredits | null> {
    try {
      const sub = await this.findActiveSubscriptionRow(userId, companyId);
      if (!sub) return null;

      const credits = await this.compute({
        userId,
        companyId: sub.companyId,
        periodStart: sub.period_start,
        periodEnd: sub.period_end,
        cupo: Number(sub.cupo ?? 0),
      });

      await this.subscriptionRepository.update(sub.id, {
        classesUsedThisPeriod: credits.consumidas,
        classesRemainingThisPeriod: credits.libres,
      });
      return credits;
    } catch (error) {
      this.logger.warn(
        `No se pudieron sincronizar créditos de ${userId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  /**
   * Detalle del cupo del período para staff (secretaria / turnos).
   * Sincroniza contadores persistidos y lista planilla / pendientes / marcadas.
   */
  async getDetailForStaff(userId: string, companyId: string): Promise<PeriodCreditsDetail> {
    const sub = await this.findActiveSubscriptionRow(userId, companyId);
    if (!sub) {
      throw new NotFoundException('No hay una suscripción activa para este alumno en el centro');
    }

    const cupo = Number(sub.cupo ?? 0);
    const credits = await this.compute({
      userId,
      companyId,
      periodStart: sub.period_start,
      periodEnd: sub.period_end,
      cupo,
    });

    await this.subscriptionRepository.update(sub.id, {
      classesUsedThisPeriod: credits.consumidas,
      classesRemainingThisPeriod: credits.libres,
    });

    const [planillaDays, pendingRows, markedRows] = await Promise.all([
      this.listPlanillaDays(userId, companyId, sub.period_start, sub.period_end),
      this.listPendingReservations(userId, companyId, sub.period_start, sub.period_end),
      this.listMarkedReservations(userId, companyId, sub.period_start, sub.period_end),
    ]);

    const planillaSet = new Set(planillaDays);
    const pendingReservations: PeriodCreditReservationRow[] = pendingRows.map((row) => ({
      id: row.id,
      date: row.date,
      startTime: row.startTime,
      endTime: row.endTime,
      overlapsPlanillaDay: planillaSet.has(row.date),
    }));

    return {
      ...credits,
      periodStart: sub.period_start,
      periodEnd: sub.period_end,
      cupo,
      planillaDays,
      pendingReservations,
      markedReservations: markedRows,
      subscriptionId: sub.id,
      planName: sub.plan_name,
    };
  }

  private async findActiveSubscriptionRow(
    userId: string,
    companyId?: string | null,
  ): Promise<{
    id: string;
    companyId: string;
    period_start: string;
    period_end: string;
    cupo: number | string | null;
    plan_name: string | null;
  } | null> {
    const rows: Array<{
      id: string;
      companyId: string;
      period_start: string;
      period_end: string;
      cupo: number | string | null;
      plan_name: string | null;
    }> = await this.subscriptionRepository.query(
      `
      SELECT
        s.id,
        s."companyId" AS "companyId",
        to_char(s."periodStartDate", 'YYYY-MM-DD') AS period_start,
        to_char(s."periodEndDate", 'YYYY-MM-DD') AS period_end,
        COALESCE(p."maxClassesPerPeriod", 0) AS cupo,
        p.name AS plan_name
      FROM user_payment_subscriptions s
      LEFT JOIN payment_plans p ON p.id = s."paymentPlanId"
      WHERE s."userId" = $1
        AND s.status = $2
        AND ($3::text IS NULL OR s."companyId"::text = $3)
      ORDER BY s."periodEndDate" DESC
      LIMIT 1
      `,
      [userId, SubscriptionStatus.ACTIVE, companyId ?? null],
    );
    const sub = rows[0];
    if (!sub?.companyId || !sub.period_start || !sub.period_end) return null;
    return sub;
  }

  private async listPlanillaDays(
    userId: string,
    companyId: string,
    periodStart: string,
    periodEnd: string,
  ): Promise<string[]> {
    const rows: Array<{ day: string }> = await this.subscriptionRepository.query(
      `
      SELECT DISTINCT to_char(left(sess.scheduled_date, 10)::date, 'YYYY-MM-DD') AS day
      FROM stp_session_instances sess
      WHERE sess.athlete_id = $1::text
        AND sess.athlete_completion_status = 'completed'
        AND left(sess.scheduled_date, 10)::date BETWEEN $3::date AND $4::date
        AND NOT EXISTS (
          SELECT 1
          FROM reservation r2
          JOIN time_slot ts2 ON ts2.id = r2."timeSlotId"
          WHERE r2."userId" = $1
            AND ts2."companyId" = $2
            AND r2.attendance_status IS NOT NULL
            AND ts2.date::date = left(sess.scheduled_date, 10)::date
        )
      ORDER BY day
      `,
      [userId, companyId, periodStart, periodEnd],
    );
    return rows.map((r) => r.day);
  }

  private async listPendingReservations(
    userId: string,
    companyId: string,
    periodStart: string,
    periodEnd: string,
  ): Promise<Array<{ id: string; date: string; startTime: string; endTime: string }>> {
    // Incluye TODAS las pendientes (también las que solapan planilla) para que staff
    // pueda ver y cancelar duplicados; el conteo de cupo las excluye vía compute().
    const rows: Array<{ id: string; date: string; startTime: string; endTime: string }> =
      await this.subscriptionRepository.query(
        `
        SELECT
          r3.id,
          to_char(ts3.date::date, 'YYYY-MM-DD') AS date,
          ts3."startTime" AS "startTime",
          ts3."endTime" AS "endTime"
        FROM reservation r3
        JOIN time_slot ts3 ON ts3.id = r3."timeSlotId"
        WHERE r3."userId" = $1
          AND ts3."companyId" = $2
          AND r3.attendance_status IS NULL
          AND ts3.date::date BETWEEN $3::date AND $4::date
        ORDER BY ts3.date, ts3."startTime"
        `,
        [userId, companyId, periodStart, periodEnd],
      );
    return rows;
  }

  private async listMarkedReservations(
    userId: string,
    companyId: string,
    periodStart: string,
    periodEnd: string,
  ): Promise<
    Array<{ id: string; date: string; startTime: string; endTime: string; attendanceStatus: boolean }>
  > {
    const rows: Array<{
      id: string;
      date: string;
      startTime: string;
      endTime: string;
      attendance_status: boolean;
    }> = await this.subscriptionRepository.query(
      `
      SELECT
        r.id,
        to_char(ts.date::date, 'YYYY-MM-DD') AS date,
        ts."startTime" AS "startTime",
        ts."endTime" AS "endTime",
        r.attendance_status
      FROM reservation r
      JOIN time_slot ts ON ts.id = r."timeSlotId"
      WHERE r."userId" = $1
        AND ts."companyId" = $2
        AND r.attendance_status IS NOT NULL
        AND ts.date::date BETWEEN $3::date AND $4::date
      ORDER BY ts.date, ts."startTime"
      `,
      [userId, companyId, periodStart, periodEnd],
    );
    return rows.map((r) => ({
      id: r.id,
      date: r.date,
      startTime: r.startTime,
      endTime: r.endTime,
      attendanceStatus: Boolean(r.attendance_status),
    }));
  }
}
