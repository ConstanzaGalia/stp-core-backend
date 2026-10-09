import { Injectable, Logger } from '@nestjs/common';
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

interface ComputeInput {
  userId: string;
  companyId: string;
  periodStart: string;
  periodEnd: string;
  cupo: number;
}

/**
 * Créditos del período:
 * - consumida: turno con asistencia marcada (presente o ausente), o presente en planilla
 *   de un día sin turno marcado.
 * - pendiente: reserva del período todavía sin asistencia.
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
          ) AS pending
        `,
        [input.userId, input.companyId, input.periodStart, input.periodEnd],
      );

    const marked = Number(rows[0]?.marked ?? 0);
    const planilla = Number(rows[0]?.planilla ?? 0);
    const pending = Number(rows[0]?.pending ?? 0);
    const consumidas = Math.min(cupo, marked + planilla);
    const reservasPendientes = pending;
    const libres = Math.max(0, cupo - consumidas - reservasPendientes);
    return { consumidas, reservasPendientes, libres };
  }

  /** Recalcula la suscripción activa y persiste usados/restantes. */
  async syncActiveSubscriptionCredits(
    userId: string,
    companyId?: string | null,
  ): Promise<void> {
    try {
      const rows: Array<{
        id: string;
        companyId: string;
        period_start: string;
        period_end: string;
        cupo: number | string | null;
      }> = await this.subscriptionRepository.query(
        `
        SELECT
          s.id,
          s."companyId" AS "companyId",
          to_char(s."periodStartDate", 'YYYY-MM-DD') AS period_start,
          to_char(s."periodEndDate", 'YYYY-MM-DD') AS period_end,
          COALESCE(p."maxClassesPerPeriod", 0) AS cupo
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
      if (!sub?.companyId || !sub.period_start || !sub.period_end) return;

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
    } catch (error) {
      this.logger.warn(
        `No se pudieron sincronizar créditos de ${userId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
