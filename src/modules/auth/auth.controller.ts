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
    const user = await this.authService.createUser(registerUserDTO);;
    const mail = registerEmail(
      user.email,
      user.activeToken,
      user.name,
      process.env.EMAIL_SENDGRID,
    );
    try {
      await this.mailingService.sendMail(mail);
      res.status(HttpStatus.OK).json({
        message: `The user was created successfully and send email to ${user.email}`,
        user
      });
    } catch (error) {
      res(HttpStatus.CREATED).json({
        message: `The user was created successfully but have an error send verify email to ${user.email}`,
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
  ): Promise<User> {
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
      process.env.EMAIL_SENDGRID,
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
}
