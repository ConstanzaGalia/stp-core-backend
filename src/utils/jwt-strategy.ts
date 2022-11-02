import * as dotenv from 'dotenv';
dotenv.config();
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from './jwt-payload.interface';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from 'src/entities/user.entity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectRepository(User) 
    private readonly userRepository: Repository<User>){
    super({
      secretOrKey:`${process.env.SECRET_JWT}`,
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    });
  }

  async validate(payload: JwtPayload): Promise<User> {
    const {email} = payload;
    const userFound = await this.userRepository.findOne({where: {email: email}});
    if (!userFound){
      throw new UnauthorizedException();
    }
    return userFound;
  }

}
