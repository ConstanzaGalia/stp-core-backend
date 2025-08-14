import {
  Body,
  Controller,
  HttpStatus,
  Post,
  Res,
  Get,
  Patch,
  UseGuards,
  Req,
  Request,
  Logger,
  Param,
} from '@nestjs/common';
import { ResendService } from 'src/services/resend.service';
import { AuthService } from './auth.service';
import { LoginUserDto } from './dto/login-user.dto';
import { RegisterUserDto } from './dto/register-user.dto';
import { registerEmail, resetPassEmail } from '../../utils/emailTemplates';
import { ActivateUserDTO } from './dto/activate-user.dto';
import { RequestResetPasswordDto } from './dto/request-reset-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { GetUser } from './get-user.decorator';
import { AuthGuard } from '@nestjs/passport';
import { User } from 'src/entities/user.entity';
import { MailingService } from '../mailer/mailing.service';
import { UserInterface } from 'src/models/interfaces/user.iterface';
import { JwtPayload } from 'src/utils/jwt-payload.interface';
import { JwtService } from '@nestjs/jwt';
import { ActivateResponseDto } from './dto/activate-response.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UpdateTrainerProfileDto } from './dto/update-trainer-profile.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private resendService: ResendService,
    private mailingService: MailingService,
    private jwtService: JwtService,
  ) {}

  @Post('/register')
  async createUser(@Res() res, @Body() registerUserDTO: RegisterUserDto) {
    const user = await this.authService.createUser(registerUserDTO);
    
    // Validar que el usuario tenga email
    if (!user.email) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        message: 'User email is required',
        error: 'EMAIL_REQUIRED'
      });
    }

    const mail = registerEmail(
      user.email,
      user.activeToken,
      user.name,
      process.env.RESEND_FROM_EMAIL || 'noreply@stp.com',
    );

    try {
      await this.mailingService.sendMail(mail);
      res.status(HttpStatus.OK).json({
        message: `The user was created successfully and send email to ${user.email}`,
        user
      });
    } catch (error) {
      console.error('Error sending email:', error);
      res.status(HttpStatus.CREATED).json({
        message: `The user was created successfully but have an error send verify email to ${user.email}`,
        error: error.message
      });
    }
  }

  @Post('/login')
  async login(
    @Res() res,
    @Body() loginUserDTO: LoginUserDto,
  ): Promise<{ token: string }> {
    const user = await this.authService.login(loginUserDTO);
    return res.status(HttpStatus.OK).json({
      message: 'Login successfully',
      user,
    });
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('/activate-account')
  async activateAccount(
    @Request() req,
    @Res() res,
    @Body() activateUserDto: ActivateUserDTO,
  ): Promise<ActivateResponseDto> {
    const user = await this.authService.activateUser(activateUserDto, req.user.id);
    const payload: JwtPayload = {
      id: user.id,
      email: user.email,
      isActive: user.isActive,
      role: [user.role],
      name: user.name,
      lastName: user.lastName,
    };

    const jwToken = this.jwtService.sign(payload);
    return res.status(HttpStatus.OK).json({
      id: user.id,
      isActive: user.isActive,
      name: user.name,
      lastName: user.lastName,
      role: user.role,
      token: jwToken
    });
  }

  @Get('/google')
  @UseGuards(AuthGuard('google'))
  async googleLogin(): Promise<any> {
    return HttpStatus.OK;
  }

  @Get('/google/redirect')
  @UseGuards(AuthGuard('google'))
  async googleAuthRedirect(@Req() req, @Res() res) {
    try {
      const token = await this.authService.loginGoogle(req)
      const redirectUrl = `${process.env.FRONTEND_URL}/login?token=${token}`;
      return res.redirect(redirectUrl);
    } catch (error) {
      Logger.log('/redirect',error);
    }
  }

  @Patch('/request-reset-password')
  async requestResetPassword(
    @Res() res,
    @Body() requestResetPasswordDto: RequestResetPasswordDto,
  ): Promise<UserInterface> {
    const user = await this.authService.resetPasswordRequest(
      requestResetPasswordDto,
    );
    const url = `${process.env.HOST}${process.env.PORT}/auth/reset-password?token=${user.resetPasswordToken}`;
    const mail = resetPassEmail(
      user.email,
      url,
      user.name,
      process.env.RESEND_FROM_EMAIL || 'noreply@stp.com',
    );
    await this.resendService.sendEmail(mail.to, mail.subject, mail.html, mail.from);
    return res.status(HttpStatus.OK).json({
      message: `Send the email to ${user.email}, for reset password`,
      user,
    });
  }

  @Patch('/reset-password')
  async resetPassword(
    @Body() resertPasswordDto: ResetPasswordDto,
  ): Promise<User> {
    return this.authService.resetPassword(resertPasswordDto);
  }

  @Patch('/change-password')
  @UseGuards(AuthGuard('jwt'))
  async changePassword(
    @Res() res,
    @Body() changePasswordDto: ChangePasswordDto,
    @GetUser() user: User,
  ): Promise<void> {
    await this.authService.changePassword(changePasswordDto, user);
    return res.status(HttpStatus.OK).json({
      message: 'The password was changed successfully',
      user,
    });
  }

  // Endpoints para actualizar roles
  @Patch('/users/:userId/role')
  @UseGuards(AuthGuard('jwt'))
  async updateUserRole(
    @Param('userId') userId: string,
    @Body() updateUserRoleDto: UpdateUserRoleDto,
    @GetUser() admin: User,
  ) {
    const updatedUser = await this.authService.updateUserRole(
      userId,
      admin.id,
      updateUserRoleDto,
    );
    return {
      message: 'User role updated successfully',
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        lastName: updatedUser.lastName,
        role: updatedUser.role,
        isActive: updatedUser.isActive,
      },
    };
  }

  @Patch('/users/own-role')
  @UseGuards(AuthGuard('jwt'))
  async updateOwnRole(
    @Body() updateUserRoleDto: UpdateUserRoleDto,
    @GetUser() user: User,
  ) {
    const updatedUser = await this.authService.updateOwnRole(
      user.id,
      updateUserRoleDto,
    );
    return {
      message: 'Your role has been updated successfully',
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        lastName: updatedUser.lastName,
        role: updatedUser.role,
        isActive: updatedUser.isActive,
      },
    };
  }

  // Endpoints para obtener información de usuarios
  @Get('/users/:userId')
  @UseGuards(AuthGuard('jwt'))
  async getUserInfo(@Param('userId') userId: string) {
    const userInfo = await this.authService.getUserInfo(userId);
    return {
      message: 'User information retrieved successfully',
      user: userInfo,
    };
  }

  @Get('/trainers/:trainerId')
  @UseGuards(AuthGuard('jwt'))
  async getTrainerInfo(@Param('trainerId') trainerId: string) {
    const trainerInfo = await this.authService.getTrainerInfo(trainerId);
    return {
      message: 'Trainer information retrieved successfully',
      trainer: trainerInfo,
    };
  }

  // Endpoints para perfil completo del entrenador
  @Get('/trainers/:trainerId/profile')
  @UseGuards(AuthGuard('jwt'))
  async getTrainerProfile(@Param('trainerId') trainerId: string) {
    const trainerProfile = await this.authService.getTrainerProfile(trainerId);
    return {
      message: 'Trainer profile retrieved successfully',
      trainer: trainerProfile,
    };
  }

  @Patch('/trainers/:trainerId/profile')
  @UseGuards(AuthGuard('jwt'))
  async updateTrainerProfile(
    @Param('trainerId') trainerId: string,
    @Body() updateTrainerProfileDto: UpdateTrainerProfileDto,
  ) {
    const updatedProfile = await this.authService.updateTrainerProfile(
      trainerId,
      updateTrainerProfileDto,
    );
    return {
      message: 'Trainer profile updated successfully',
      trainer: updatedProfile,
    };
  }
}
