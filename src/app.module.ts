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
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      entities: [entitiesPath],
      synchronize: true,
      extra: {
        max: 5,
        idleTimeoutMillis: 10000,
        connectionTimeoutMillis: 10000,
      },
      ssl: {
        rejectUnauthorized: false,
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
