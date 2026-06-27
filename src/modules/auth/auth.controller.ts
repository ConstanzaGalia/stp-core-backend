import {
  BadRequestException,
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
import { AuthService } from './auth.service';
import { LoginUserDto } from './dto/login-user.dto';
import { RegisterUserDto } from './dto/register-user.dto';
import { registerEmail, resetPassEmail } from '../../utils/emailTemplates';
import { ActivateUserDTO } from './dto/activate-user.dto';
import { RequestResetPasswordDto } from './dto/request-reset-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { GetUser } from './get-user.decorator';
import { AuthGuard } from '@nestjs/passport';
import { User } from 'src/entities/user.entity';
import { MailingService } from '../mailer/mailing.service';
import { ActivateResponseDto } from './dto/activate-response.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UpdateTrainerProfileDto } from './dto/update-trainer-profile.dto';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';
import { UserRole } from 'src/common/enums/enums';
import { SkipCompanySubscriptionCheck } from 'src/common/decorators/skip-company-subscription-check.decorator';

@Controller('auth')
@SkipCompanySubscriptionCheck()
export class AuthController {
  constructor(
    private authService: AuthService,
    private mailingService: MailingService,
  ) {}

  @Post('/register')
  async createUser(@Res() res, @Body() registerUserDTO: RegisterUserDto) {
    const user = await this.authService.createUser(registerUserDTO);
    
    if (!user.email) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        message: 'User email is required',
        error: 'EMAIL_REQUIRED'
      });
    }

    const createdUser = user as typeof user & { activeToken?: string; nameForEmail?: string };
    const mail = registerEmail(
      user.email,
      createdUser.activeToken,
      createdUser.nameForEmail || user.name,
      process.env.RESEND_FROM_EMAIL || 'noreply@stp.com',
      Number(process.env.OTP_EXPIRES_MINUTES) || 15,
    );

    try {
      await this.mailingService.sendMail(mail);
      res.status(HttpStatus.OK).json({
        message: `The user was created successfully and send email to ${user.email}`,
        user: {
          id: user.id,
          name: user.name,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
          isActive: user.isActive,
        },
      });
    } catch (error) {
      console.error('Error sending email:', error);
      res.status(HttpStatus.CREATED).json({
        message: `The user was created successfully but have an error send verify email to ${user.email}`,
        error: error.message,
        user: {
          id: user.id,
          name: user.name,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
          isActive: user.isActive,
        },
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

  @Get('/me')
  @UseGuards(AuthGuard('jwt'))
  async getCurrentSession(@GetUser() user: User) {
    return {
      message: 'Session valid',
      user: this.authService.toSessionUser(user),
    };
  }

  @Post('/logout')
  async logout(@Res() res) {
    return res.status(HttpStatus.OK).json({
      message: 'Logged out successfully',
    });
  }

  @Post('/activate-account')
  async activateAccount(
    @Res() res,
    @Body() activateUserDto: ActivateUserDTO,
  ): Promise<ActivateResponseDto> {
    const user = await this.authService.activateUser(activateUserDto);
    const jwToken = this.authService.signTokenForUser(user);
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
      const { token, needsRoleSelection } = await this.authService.loginGoogle(req);
      const params = new URLSearchParams({
        token,
        needsRoleSelection: needsRoleSelection ? '1' : '0',
      });
      const redirectUrl = `${process.env.FRONTEND_URL}/login?${params.toString()}`;
      return res.redirect(redirectUrl);
    } catch (error) {
      Logger.log('/redirect',error);
    }
  }

  @Patch('/users/complete-google-role-onboarding')
  @UseGuards(AuthGuard('jwt'))
  async completeGoogleRoleOnboarding(
    @Body() body: { role: UserRole.ATHLETE | UserRole.TRAINER },
    @GetUser() user: User,
  ) {
    if (!body?.role || (body.role !== UserRole.ATHLETE && body.role !== UserRole.TRAINER)) {
      throw new BadRequestException('Invalid role. Only ATHLETE or TRAINER is allowed');
    }

    const result = await this.authService.completeGoogleRoleOnboarding(user.id, body.role);
    return {
      message: 'Role onboarding completed successfully',
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        lastName: result.user.lastName,
        role: result.user.role,
        isActive: result.user.isActive,
      },
      token: result.token,
    };
  }

  @Post('/resend-verification')
  async resendVerification(
    @Res() res,
    @Body() resendVerificationDto: ResendVerificationDto,
  ) {
    const result = await this.authService.resendVerification(resendVerificationDto);

    if (result.sent && result.email && result.activeToken) {
      const mail = registerEmail(
        result.email,
        result.activeToken,
        result.name,
        process.env.RESEND_FROM_EMAIL || 'noreply@stp.com',
        Number(process.env.OTP_EXPIRES_MINUTES) || 15,
      );
      try {
        await this.mailingService.sendMail(mail);
      } catch (error) {
        Logger.error('Error resending verification email:', error);
        return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          message: 'No se pudo reenviar el código de verificación',
        });
      }
    }

    return res.status(HttpStatus.OK).json({
      message: 'Si el email existe y la cuenta no está verificada, se envió un nuevo código',
    });
  }

  @Patch('/request-reset-password')
  async requestResetPassword(
    @Res() res,
    @Body() requestResetPasswordDto: RequestResetPasswordDto,
  ) {
    const result = await this.authService.resetPasswordRequest(
      requestResetPasswordDto,
    );

    if (result) {
      const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
      const url = `${frontendUrl}/restablecer-password?token=${result.resetPasswordToken}`;
      const mail = resetPassEmail(
        result.user.email,
        url,
        result.user.name,
        process.env.RESEND_FROM_EMAIL || 'noreply@stp.com',
        Number(process.env.RESET_TOKEN_EXPIRES_MINUTES) || 60,
      );
      try {
        await this.mailingService.sendMail(mail);
      } catch (error) {
        Logger.error('Error sending reset password email:', error);
        return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          message: 'No se pudo enviar el email de recuperación',
        });
      }
    }

    return res.status(HttpStatus.OK).json({
      message: 'Si el email existe, recibirás instrucciones para restablecer tu contraseña',
    });
  }

  @Patch('/reset-password')
  async resetPassword(
    @Res() res,
    @Body() resertPasswordDto: ResetPasswordDto,
  ) {
    await this.authService.resetPassword(resertPasswordDto);
    return res.status(HttpStatus.OK).json({
      message: 'Password reset successfully',
    });
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

  @Patch('/users/:userId/profile')
  @UseGuards(AuthGuard('jwt'))
  async updateUserProfile(
    @Param('userId') userId: string,
    @Body() updateUserProfileDto: UpdateUserProfileDto,
  ) {
    const updatedProfile = await this.authService.updateUserProfile(
      userId,
      updateUserProfileDto,
    );
    return {
      message: 'User profile updated successfully',
      user: updatedProfile,
    };
  }
}
