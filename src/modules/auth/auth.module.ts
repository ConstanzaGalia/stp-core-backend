import * as dotenv from 'dotenv';
dotenv.config();
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { User } from 'src/entities/user.entity';
import { EncryptService } from 'src/services/bcrypt.service';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from '../../utils/jwt-strategy';
// import { UserRepository } from 'src/repositories/user.repository';
import { SendgridService } from 'src/services/sendgrid.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GoogleStrategy } from 'src/utils/google.strategy';
import { MailingService } from '../mailer/mailing.service';

// import { MongooseModule } from '@nestjs/mongoose';
// import { UserSchema } from '../../models/user.model';
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
    TypeOrmModule.forFeature([User])
    // MongooseModule.forFeature([{ name: 'User', schema: UserSchema }]),
  ],
  controllers: [AuthController],
  providers: [AuthService, EncryptService, JwtStrategy, SendgridService, GoogleStrategy, MailingService],
  exports: [JwtStrategy, PassportModule]
})
export class AuthModule {}
