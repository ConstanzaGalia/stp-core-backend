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
      entities: ['dist/**/*.entity.{ts,js}'],
      synchronize: true,
      extra: {
        connectionLimit: 15,
      },
      ssl: {
        rejectUnauthorized: false,
      },
    }),

    AuthModule,
    MailingModule,
    CompanyModule,
    ExerciseModule,
    ReservationsModule,
    PaymentsModule,
    AthletesModule,
  ],
  controllers: [],
  providers: [Pagination],
})
export class AppModule {
  static port: number;
  constructor(private readonly configService: ConfigService){
    AppModule.port = +this.configService.get('PORT')
  }
}
