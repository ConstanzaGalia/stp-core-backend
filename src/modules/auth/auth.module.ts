import * as dotenv from 'dotenv';
dotenv.config();
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UserSchema } from '../../models/user.model';
import { EncryptService } from 'src/services/bcrypt.service';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from '../../utils/jwt-strategy';
import { UserRepository } from 'src/repositories/user.repository';
import { SendgridService } from 'src/services/sendgrid.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GoogleStrategy } from 'src/utils/google.strategy';
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get('SECRET_JWT'),
        signOptions: {
            expiresIn: '4h',
        },
      }),
      inject: [ConfigService],
    }),
    MongooseModule.forFeature([{ name: 'User', schema: UserSchema }]),
  ],
  controllers: [AuthController],
  providers: [UserRepository, AuthService, EncryptService, JwtStrategy, SendgridService, GoogleStrategy],
  exports: [JwtStrategy, PassportModule]
})
export class AuthModule {}
