import 'dotenv/config'
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { MailingModule } from './modules/mailer/mailing.module';

// import { TYPEORM_CONFIG } from './common/config/typeorm-config';
import { CompanyModule } from './modules/company/company.module';
import { Pagination } from './common/pagination/pagination';
import { ExerciseModule } from './modules/exercise/exercise.module';
import { ReservationsModule } from './modules/reservation/reservation.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { AthletesModule } from './modules/athletes/athletes.module';
import { AthleteEvaluationModule } from './modules/athlete-evaluation/athlete-evaluation.module';
import { PhysicalEvaluationModule } from './modules/physical-evaluation/physical-evaluation.module';
import { InjuriesModule } from './modules/injuries/injuries.module';
import { ProductsModule } from './modules/products/products.module';
import { HealthModule } from './modules/health/health.module';
import { TrainingPlannerModule } from './modules/training-planner/training-planner.module';
import { StaffSchedulingModule } from './modules/staff-scheduling/staff-scheduling.module';
import { TYPEORM_ENTITIES } from './typeorm-entities';

/** Supabase Session pooler (puerto 5432): límite bajo → MaxClientsInSessionMode si el pool es grande. */
const SUPABASE_SESSION_POOL_CAP = 4

function resolvePostgresPoolMax(config: ConfigService): number {
  const defaultPoolMax = 5
  const parsed = Number(config.get('DB_POOL_MAX', String(defaultPoolMax)))
  let max = Number.isFinite(parsed) && parsed > 0 ? parsed : defaultPoolMax

  const dbUrl = config.get<string>('DATABASE_URL')?.trim() || ''
  const dbHost = (config.get<string>('DB_HOST') || '').toLowerCase()
  const dbPort = Number(config.get('DB_PORT', 5432))

  const urlIsSupabaseSession =
    dbUrl.length > 0 &&
    dbUrl.toLowerCase().includes('pooler.supabase.com') &&
    !/:6543(\/|\?|$)/.test(dbUrl)
  const hostIsSupabaseSession =
    dbHost.includes('pooler.supabase.com') && dbPort !== 6543

  if (urlIsSupabaseSession || hostIsSupabaseSession) {
    max = Math.min(max, SUPABASE_SESSION_POOL_CAP)
  }
  return max
}

@Module({
  imports: [
    ConfigModule.forRoot({ envFilePath: '.env', isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const sslEnabled = String(config.get('DB_SSL', 'true')).toLowerCase() !== 'false';
        /**
         * Tamaño del pool: `resolvePostgresPoolMax` (default 5; tope 4 en Supabase Session pooler).
         */
        const poolMax = resolvePostgresPoolMax(config);
        const connectionTimeoutMs = Number(config.get('DB_CONNECTION_TIMEOUT_MS', '60000'));
        const idleTimeoutMs = Number(config.get('DB_IDLE_TIMEOUT_MS', '30000'));

        const poolExtra = {
          max: poolMax,
          idleTimeoutMillis: Number.isFinite(idleTimeoutMs) ? idleTimeoutMs : 30000,
          connectionTimeoutMillis: Number.isFinite(connectionTimeoutMs) ? connectionTimeoutMs : 60000,
          keepAlive: true,
          keepAliveInitialDelayMillis: 10000,
        };

        const base = {
          type: 'postgres' as const,
          entities: TYPEORM_ENTITIES,
          synchronize: true,
          extra: poolExtra,
          ssl: sslEnabled ? { rejectUnauthorized: false } : false,
        };

        const databaseUrl = config.get<string>('DATABASE_URL')?.trim();
        if (databaseUrl) {
          return { ...base, url: databaseUrl };
        }

        return {
          ...base,
          host: config.get<string>('DB_HOST'),
          port: Number(config.get('DB_PORT', 5432)),
          username: config.get<string>('DB_USERNAME'),
          password: config.get<string>('DB_PASSWORD'),
          database: config.get<string>('DB_NAME'),
        };
      },
    }),

    HealthModule,
    AuthModule,
    MailingModule,
    CompanyModule,
    ExerciseModule,
    ReservationsModule,
    PaymentsModule,
    AthletesModule,
    AthleteEvaluationModule,
    PhysicalEvaluationModule,
    InjuriesModule,
    ProductsModule,
    TrainingPlannerModule,
    StaffSchedulingModule,
  ],
  controllers: [],
  providers: [Pagination],
})
export class AppModule {}
