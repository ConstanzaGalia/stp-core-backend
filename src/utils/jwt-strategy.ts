import * as dotenv from 'dotenv';
dotenv.config();
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserInterface } from 'src/models/interfaces/user.iterface';
import { JwtPayload } from './jwt-payload.interface';
import { UserRepository } from 'src/repositories/user.repository';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private userRepository: UserRepository){
    super({
      secretOrKey:`${process.env.SECRET_JWT}`,
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    });
  }

  async validate(payload: JwtPayload): Promise<UserInterface> {
    const {email} = payload;
    const userFound = await this.userRepository.findOneByEmail(email);
    if (!userFound){
      throw new UnauthorizedException();
    }
    return userFound;
  }

}
