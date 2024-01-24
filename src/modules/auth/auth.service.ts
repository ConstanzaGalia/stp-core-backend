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
import { RegisterUserDto } from './dto/register-user.dto';
import { EncryptService } from 'src/services/bcrypt.service';
import { LoginUserDto } from './dto/login-user.dto';
import { JwtService } from '@nestjs/jwt';
import { JwtPayload } from '../../utils/jwt-payload.interface';
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
    private encryptService: EncryptService,
    private jwtService: JwtService,
  ) {}

  async createUser(registerUserDTO: RegisterUserDto): Promise<User> {
    const { name, lastName, email, password, role } = registerUserDTO;
    try {
      const passEncrypted = await this.encryptService.encryptedData(password);
      const activeToken = v4();
      const userToSave = {
        name,
        lastName,
        email,
        password: passEncrypted,
        activeToken,
        role,
      }
      return await this.userRepository.save(userToSave);
    } catch (error) {
      if (error.code === '23505') {
        throw new ConflictException('USER_HAS_BEEN_REGISTERED');
      }
      throw new InternalServerErrorException();
    }
  }

  async login(loginUserDTO: LoginUserDto): Promise<string> {
    const { email, password } = loginUserDTO;
    const userFound = await this.userRepository.findOne({where: {email: email}});
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
      id: userFound.id,
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
      const userFound = await this.userRepository.findOne({where: {email: email}});
      if (!userFound) {
        const password = await this.encryptService.encryptedData(id);
        const newUser = await this.userRepository.save({
          name: firstName,
          lastName,
          email,
          password,
          isActive: verified,
        });
        const payload: JwtPayload = {
          id: newUser.id,
          email,
          isActive: newUser.isActive,
        };
        return this.jwtService.sign(payload);
      }
      const payload: JwtPayload = {
        id: userFound.id,
        email,
        isActive: userFound.isActive,
      };
      return this.jwtService.sign(payload);
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        throw new ConflictException('This email is already registered.');
      }
      throw new InternalServerErrorException();
    }
  }

  async activateUser(activateUserDto: ActivateUserDTO): Promise<User> {
    const { id, token } = activateUserDto;
    const user = await this.userRepository.findOne({where: {id: id, activeToken: token, isActive: false}});
    if (!user) {
      throw new UnprocessableEntityException(
        'User not found or is already active',
      );
    }
    user.isActive = true;
    return await this.userRepository.save(user);
  }

  async resetPasswordRequest(
    resetPasswordDto: RequestResetPasswordDto,
  ): Promise<User> {
    const { email } = resetPasswordDto;
    const resetPasswordToken = v4();
    const user = await this.userRepository.findOne({where:{email:email}});
    if (!user) {
      throw new NotFoundException('User not found');
    }
    user.resetPasswordToken = resetPasswordToken;
    return await this.userRepository.save(user);
  }

  async resetPassword(
    resetPasswordDto: ResetPasswordDto,
  ): Promise<User> {
    const { resetPasswordToken, password } = resetPasswordDto;
    const passEncrypted = await this.encryptService.encryptedData(password);
    const user = await this.userRepository.findOne({where: {resetPasswordToken: resetPasswordToken}});
    if (!user) {
      throw new NotFoundException('User not found');
    }
    user.resetPasswordToken = null;
    user.password = passEncrypted;
    return await this.userRepository.save(user);
  }

  async changePassword(
    changePasswordDto: ChangePasswordDto,
    user: User,
  ): Promise<User> {
    const { oldPassword, newPassword } = changePasswordDto;
    const checkPass = await this.encryptService.compareData(
      oldPassword,
      user.password,
    );
    if (checkPass) {
      const newPass = await this.encryptService.encryptedData(newPassword);
      const userUpdate = await this.userRepository.findOne({where: {email: user.email}});
      userUpdate.password = newPass;
      return await this.userRepository.save(userUpdate);
    } else {
      throw new BadRequestException('The password does not mach');
    }
  }
}
