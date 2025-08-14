import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
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
import { UserRegiter } from './dto/user-response.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { UserRole } from 'src/common/enums/enums';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UpdateTrainerProfileDto } from './dto/update-trainer-profile.dto';
import { TrainerProfileResponseDto } from './dto/trainer-profile-response.dto';
@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    private encryptService: EncryptService,
    private jwtService: JwtService,
  ) {}

  async createUser(registerUserDTO: RegisterUserDto): Promise<UserRegiter> {
    const { name, lastName, email, password, role } = registerUserDTO;
    try {
      const passEncrypted = await this.encryptService.encryptedData(password);
      const activeToken = this.generateOTP();
      const userToSave = {
        name,
        lastName,
        email,
        password: passEncrypted,
        activeToken,
        role,
      }
      const userSave = await this.userRepository.save(userToSave);
      const payload: JwtPayload = {
        id: userSave.id,
        email,
        isActive: userSave.isActive,
        role: [userSave.role],
        name: userSave.name,
        lastName: userSave.lastName,
      };

      const token = this.jwtService.sign(payload);
      return {
        id: userSave.id,
        name,
        lastName,
        email,
        role,
        isActive: userSave.isActive,
        activeToken,
        token,
      }
    } catch (error) {
      if (error.code === '23505') {
        throw new ConflictException('USER_HAS_BEEN_REGISTERED');
      }
      throw new InternalServerErrorException();
    }
  }

  async login(loginUserDTO: LoginUserDto): Promise<LoginResponseDto> {
    const { email, password } = loginUserDTO;
    const userFound = await this.userRepository.findOne({where: {email: email}});
    if (
      !userFound ||
      !(await this.encryptService.compareData(password, userFound.password))
    ) {
      throw new UnauthorizedException('Please check your credentials');
    }
    const payload: JwtPayload = {
      id: userFound.id,
      email,
      isActive: userFound.isActive,
      role: [userFound.role],
      name: userFound.name,
      lastName: userFound.lastName,
    };
    const token = this.jwtService.sign(payload);
    return {
      id: userFound.id,
      token,
      isActive: userFound.isActive,
      name: userFound.name,
      lastName: userFound.lastName,
      role: userFound.role,
    };
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
          role: UserRole.TRAINER, // Asignar rol por defecto para nuevos usuarios
        });
        const payload: JwtPayload = {
          id: newUser.id,
          email,
          isActive: newUser.isActive,
          role: [newUser.role],
          name: newUser.name,
          lastName: newUser.lastName,
        };
        return this.jwtService.sign(payload);
      }
      const payload: JwtPayload = {
        id: userFound.id,
        email,
        isActive: userFound.isActive,
        role: [userFound.role],
        name: userFound.name,
        lastName: userFound.lastName,
      };
      return this.jwtService.sign(payload);
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        throw new ConflictException('This email is already registered.');
      }
      throw new InternalServerErrorException();
    }
  }

  async activateUser(activateUserDto: ActivateUserDTO, id: string): Promise<User> {
    try {
      const { token } = activateUserDto;
      const user = await this.userRepository.findOne({where: {id: id, activeToken: token, isActive: false}});
      if (!user) {
        throw new UnprocessableEntityException(
          'User not found or is already active',
        );
      }
      user.isActive = true;
      const activeUser = await this.userRepository.save(user);
      return activeUser
    } catch (error) {
      Logger.log('Activate-User-Endpoint', error)
    }
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

  private generateOTP(): string {
    const otp = Math.floor(100000 + Math.random() * 900000);
    return otp.toString();
  }

  async updateUserRole(
    userId: string,
    adminId: string,
    updateUserRoleDto: UpdateUserRoleDto,
  ): Promise<User> {
    // Verificar que el usuario a actualizar existe
    const userToUpdate = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!userToUpdate) {
      throw new NotFoundException('User not found');
    }

    // Verificar que el admin tiene permisos para cambiar roles
    const admin = await this.userRepository.findOne({
      where: { id: adminId },
    });

    if (!admin) {
      throw new NotFoundException('Admin user not found');
    }

    // Solo STP_ADMIN puede cambiar roles
    if (admin.role !== UserRole.STP_ADMIN) {
      throw new UnauthorizedException('Only STP_ADMIN can change user roles');
    }

    // Verificar que no se está cambiando el rol de otro STP_ADMIN
    if (userToUpdate.role === UserRole.STP_ADMIN && adminId !== userId) {
      throw new UnauthorizedException('Cannot change role of another STP_ADMIN');
    }

    // Actualizar el rol
    userToUpdate.role = updateUserRoleDto.role;

    // Guardar los cambios
    const updatedUser = await this.userRepository.save(userToUpdate);

    Logger.log(`User role updated: ${userId} -> ${updateUserRoleDto.role} by admin: ${adminId}`);

    return updatedUser;
  }

  async updateOwnRole(
    userId: string,
    updateUserRoleDto: UpdateUserRoleDto,
  ): Promise<User> {
    // Verificar que el usuario existe
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Verificar que el usuario está activo
    if (!user.isActive) {
      throw new BadRequestException('User account is not active');
    }

    // Solo permitir ciertos cambios de rol (por ejemplo, de ATHLETE a TRAINER)
    const allowedRoleChanges = [
      { from: UserRole.ATHLETE, to: [UserRole.TRAINER, UserRole.SUB_TRAINER] },
      { from: UserRole.SUB_TRAINER, to: [UserRole.TRAINER] },
    ];

    const allowedChange = allowedRoleChanges.find(
      change => change.from === user.role && change.to.includes(updateUserRoleDto.role)
    );

    if (!allowedChange) {
      throw new BadRequestException('Role change not allowed');
    }

    // Actualizar el rol
    user.role = updateUserRoleDto.role;

    // Guardar los cambios
    const updatedUser = await this.userRepository.save(user);

    Logger.log(`User updated own role: ${userId} -> ${updateUserRoleDto.role}`);

    return updatedUser;
  }

  // Método para obtener información de un usuario específico
  async getUserInfo(userId: string): Promise<any> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['company'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      lastName: user.lastName,
      role: user.role,
      isActive: user.isActive,
      phoneNumber: user.phoneNumber,
      country: user.country,
      city: user.city,
      imageProfile: user.imageProfile,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
      companies: user.company || [],
    };
  }

  // Método para obtener información de entrenadores específicamente
  async getTrainerInfo(trainerId: string): Promise<any> {
    const trainer = await this.userRepository.findOne({
      where: { 
        id: trainerId,
        role: In([UserRole.TRAINER, UserRole.SUB_TRAINER])
      },
      relations: ['company'],
    });

    if (!trainer) {
      throw new NotFoundException('Trainer not found');
    }

    return {
      id: trainer.id,
      email: trainer.email,
      name: trainer.name,
      lastName: trainer.lastName,
      role: trainer.role,
      isActive: trainer.isActive,
      phoneNumber: trainer.phoneNumber ? trainer.phoneNumber.toString() : null,
      country: trainer.country,
      city: trainer.city,
      imageProfile: trainer.imageProfile,
      specialty: trainer.specialty,
      biography: trainer.biography,
      experienceYears: trainer.experienceYears,
      createdAt: trainer.created_at,
      updatedAt: trainer.updated_at,
      companies: trainer.company || [],
    };
  }

  // Método para obtener perfil completo del entrenador
  async getTrainerProfile(trainerId: string): Promise<TrainerProfileResponseDto> {
    const trainer = await this.userRepository.findOne({
      where: { 
        id: trainerId,
      },
      relations: ['company'],
    });

    if (!trainer) {
      throw new NotFoundException('Trainer not found');
    }

    // Obtener la fecha de contratación (asociación al centro más reciente)
    let hireDate = null;
    if (trainer.company && trainer.company.length > 0) {
      // Usar la fecha de creación como aproximación de la fecha de contratación
      hireDate = trainer.created_at;
    }

    return {
      id: trainer.id,
      email: trainer.email,
      name: trainer.name,
      lastName: trainer.lastName,
      role: trainer.role,
      isActive: trainer.isActive,
      phoneNumber: trainer.phoneNumber ? trainer.phoneNumber.toString() : null,
      country: trainer.country,
      city: trainer.city,
      imageProfile: trainer.imageProfile,
      specialty: trainer.specialty,
      biography: trainer.biography,
      experienceYears: trainer.experienceYears,
      createdAt: trainer.created_at,
      updatedAt: trainer.updated_at,
      companies: trainer.company || [],
      hireDate: hireDate,
    };
  }

  // Método para actualizar perfil del entrenador
  async updateTrainerProfile(
    trainerId: string,
    updateTrainerProfileDto: UpdateTrainerProfileDto,
  ): Promise<TrainerProfileResponseDto> {
    const trainer = await this.userRepository.findOne({
      where: { 
        id: trainerId,
      },
    });

    if (!trainer) {
      throw new NotFoundException('Trainer not found');
    }

    // Actualizar los campos del perfil
    if (updateTrainerProfileDto.specialty !== undefined) {
      trainer.specialty = updateTrainerProfileDto.specialty;
    }
    if (updateTrainerProfileDto.biography !== undefined) {
      trainer.biography = updateTrainerProfileDto.biography;
    }
    if (updateTrainerProfileDto.experienceYears !== undefined) {
      trainer.experienceYears = updateTrainerProfileDto.experienceYears;
    }
    if (updateTrainerProfileDto.phoneNumber !== undefined) {
      // Convertir a number solo si es un número válido
      const phoneNumber = parseInt(updateTrainerProfileDto.phoneNumber);
      if (!isNaN(phoneNumber)) {
        trainer.phoneNumber = phoneNumber;
      }
    }
    if (updateTrainerProfileDto.country !== undefined) {
      trainer.country = updateTrainerProfileDto.country;
    }
    if (updateTrainerProfileDto.city !== undefined) {
      trainer.city = updateTrainerProfileDto.city;
    }
    if (updateTrainerProfileDto.imageProfile !== undefined) {
      trainer.imageProfile = updateTrainerProfileDto.imageProfile;
    }

    // Guardar los cambios
    const updatedTrainer = await this.userRepository.save(trainer);

    // Obtener información completa del entrenador actualizado
    return this.getTrainerProfile(trainerId);
  }
}
