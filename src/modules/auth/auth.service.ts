import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserInterface } from '../../models/interfaces/user.iterface';
import { RegisterUserDto } from './dto/register-user.dto';
import { EncryptService } from 'src/services/bcrypt.service';
import { LoginUserDto } from './dto/login-user.dto';
import { JwtService } from '@nestjs/jwt';
import { JwtPayload } from '../../utils/jwt-payload.interface';
// import { UserRepository } from 'src/repositories/user.repository';
import { v4 } from 'uuid';
import { ActivateUserDTO } from './dto/activate-user.dto';
import { RequestResetPasswordDto } from './dto/request-reset-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { User } from 'src/entities/user.entity';
@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    // private userRepository: UserRepository,
    private encryptService: EncryptService,
    private jwtService: JwtService,
  ) {}

  async createUser(registerUserDTO: RegisterUserDto): Promise<User> {
    const { name, lastName, email, password } = registerUserDTO;
    try {
      const passEncrypted = await this.encryptService.encryptedData(password);
      const activeToken = v4();
      return await this.userRepository.createUser(
        name,
        lastName,
        email,
        passEncrypted,
        activeToken,
      );
    } catch (error) {
      if (error.code === 11000) {
        throw new ConflictException('This email is already registered.');
      }
      throw new InternalServerErrorException();
    }
  }

  async login(loginUserDTO: LoginUserDto): Promise<string> {
    const { email, password } = loginUserDTO;
    const userFound = await this.userRepository.findOneByEmail(email);
    if (
      !userFound ||
      !(await this.encryptService.compareData(password, userFound.password))
    ) {
      throw new UnauthorizedException('Please check your credentials');
    }
    if (!userFound.isActive) {
      throw new UnauthorizedException('Please active your account');
    }
    const payload: JwtPayload = {
      id: userFound._id,
      email,
      isActive: userFound.isActive,
    };
    const token = this.jwtService.sign(payload);
    return token;
  }

  async loginGoogle(req: any) {
    const { email, firstName, lastName, id, verified } = req.user;
    if (!req.user) {
      throw new NotFoundException('User not found in google');
    }
    try {
      const userFound = await this.userRepository.findOneByEmail(email);
      if (!userFound) {
        const pass = await this.encryptService.encryptedData(id);
        const newUser = await this.userRepository.createUser(
          firstName,
          lastName,
          email,
          pass,
          null,
          verified,
        );
        const payload: JwtPayload = {
          id: newUser._id,
          email,
          isActive: newUser.isActive,
        };
        const token = this.jwtService.sign(payload);
        return token;
      }
      const payload: JwtPayload = {
        id: userFound._id,
        email,
        isActive: userFound.isActive,
      };
      const token = this.jwtService.sign(payload);
      return token;
    } catch (error) {
      if (error.code === 11000) {
        throw new ConflictException('This email is already registered.');
      }
      throw new InternalServerErrorException();
    }
  }

  async activateUser(activateUserDto: ActivateUserDTO): Promise<UserInterface> {
    const { _id, token } = activateUserDto;
    const isActive = true;
    const user = await this.userRepository.findOneInactiveAndUpdate(
      _id,
      token,
      isActive,
    );
    if (!user) {
      throw new UnprocessableEntityException(
        'User not found or is already active',
      );
    }
    return user;
  }

  async resetPasswordRequest(
    resetPasswordDto: RequestResetPasswordDto,
  ): Promise<UserInterface> {
    const { email } = resetPasswordDto;
    const resetPasswordToken = v4();
    const user = await this.userRepository.findOneUpdate(email, {
      resetPasswordToken,
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async resetPassword(
    resetPasswordDto: ResetPasswordDto,
  ): Promise<UserInterface> {
    const { resetPasswordToken, password } = resetPasswordDto;
    const passEncrypted = await this.encryptService.encryptedData(password);
    const user = await this.userRepository.findOneByResetPassToken(
      resetPasswordToken,
      passEncrypted,
    );
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async changePassword(
    changePasswordDto: ChangePasswordDto,
    user: UserInterface,
  ): Promise<UserInterface> {
    const { oldPassword, newPassword } = changePasswordDto;
    const checkPass = await this.encryptService.compareData(
      oldPassword,
      user.password,
    );
    if (checkPass) {
      const newPass = await this.encryptService.encryptedData(newPassword);
      const userUpdate = await this.userRepository.findOneUpdate(user.email, {
        password: newPass,
      });
      return userUpdate;
    } else {
      throw new BadRequestException('The password does not mach');
    }
  }
}
