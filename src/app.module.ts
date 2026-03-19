import 'dotenv/config'
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as path from 'path';
import { AuthModule } from './modules/auth/auth.module';
import { MailingModule } from './modules/mailer/mailing.module';

// import { TYPEORM_CONFIG } from './common/config/typeorm-config';
import { CompanyModule } from './modules/company/company.module';
import { Pagination } from './common/pagination/pagination';
import { ExerciseModule } from './modules/exercise/exercise.module';
import { ReservationsModule } from './modules/reservation/reservation.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { AthletesModule } from './modules/athletes/athletes.module';
import { ProductsModule } from './modules/products/products.module';
import { HealthModule } from './modules/health/health.module';

// Ruta relativa a este archivo: con ts-node carga src/entities (mismas clases que los servicios);
// compilado carga dist/src/entities. Así se evita "No metadata for User" al correr scripts con ts-node.
const entitiesPath = path.join(__dirname, 'entities', '**', '*.entity.{ts,js}');

@Module({
  imports: [
    ConfigModule.forRoot({ envFilePath: '.env', isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const sslEnabled = String(config.get('DB_SSL', 'true')).toLowerCase() !== 'false';
        /** PROD remota: 10s suele quedarse corto; pool chico + idle 10s genera timeouts bajo carga. */
        const poolMax = Number(config.get('DB_POOL_MAX', '15'));
        const connectionTimeoutMs = Number(config.get('DB_CONNECTION_TIMEOUT_MS', '60000'));
        const idleTimeoutMs = Number(config.get('DB_IDLE_TIMEOUT_MS', '30000'));

        return {
          type: 'postgres' as const,
          host: config.get<string>('DB_HOST'),
          port: Number(config.get('DB_PORT', 5432)),
          username: config.get<string>('DB_USERNAME'),
          password: config.get<string>('DB_PASSWORD'),
          database: config.get<string>('DB_NAME'),
          entities: [entitiesPath],
          synchronize: true,
          extra: {
            max: Number.isFinite(poolMax) && poolMax > 0 ? poolMax : 15,
            idleTimeoutMillis: Number.isFinite(idleTimeoutMs) ? idleTimeoutMs : 30000,
            connectionTimeoutMillis: Number.isFinite(connectionTimeoutMs) ? connectionTimeoutMs : 60000,
            /** Evita que firewalls cloud cierren sockets “muertos” sin que el pool lo note. */
            keepAlive: true,
            keepAliveInitialDelayMillis: 10000,
          },
          ssl: sslEnabled ? { rejectUnauthorized: false } : false,
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
    ProductsModule,
  ],
  controllers: [],
  providers: [Pagination],
})
export class AppModule {}
