import 'dotenv/config'
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from './modules/auth/auth.module';
import { TYPEORM_CONFIG } from './common/config/typeorm-config';
@Module({
  imports: [
    ConfigModule.forRoot({ envFilePath: 'dev.local.env', isGlobal: true }),
    TypeOrmModule.forRoot(TYPEORM_CONFIG),
    MongooseModule.forRoot(process.env.MONGO_DB),
    AuthModule
  ],
  controllers: [],
  providers: [],
})
export class AppModule {
  static port: number;
  constructor(private readonly configService: ConfigService){
    AppModule.port = +this.configService.get('PORT')
  }
}
