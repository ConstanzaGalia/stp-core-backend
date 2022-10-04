import 'dotenv/config'
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from './modules/auth/auth.module';
@Module({
  imports: [
    ConfigModule.forRoot({ envFilePath: 'dev.local.env', isGlobal: true }),
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
