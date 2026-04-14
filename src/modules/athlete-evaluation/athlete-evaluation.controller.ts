import { Controller, Post, Get, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GetUser } from '../auth/get-user.decorator';
import { User } from 'src/entities/user.entity';
import { AthleteEvaluationService } from './athlete-evaluation.service';
import { CreateEvaluationDto, UpdateAthleteProfileDto } from './dto/create-evaluation.dto';

@Controller('athlete-evaluations')
@UseGuards(AuthGuard('jwt'))
export class AthleteEvaluationController {
  constructor(private readonly service: AthleteEvaluationService) {}

  @Post(':userId')
  createEvaluation(@GetUser() actor: User, @Param('userId') userId: string, @Body() dto: CreateEvaluationDto) {
    return this.service.createEvaluation(actor, userId, dto);
  }

  @Get(':userId')
  getHistory(@GetUser() actor: User, @Param('userId') userId: string) {
    return this.service.getHistory(actor, userId);
  }

  @Get(':userId/current')
  getCurrent(@GetUser() actor: User, @Param('userId') userId: string) {
    return this.service.getCurrent(actor, userId);
  }

  @Get(':userId/profile')
  getProfile(@GetUser() actor: User, @Param('userId') userId: string) {
    return this.service.getAthleteProfile(actor, userId);
  }

  @Patch(':userId/profile')
  updateProfile(@GetUser() actor: User, @Param('userId') userId: string, @Body() dto: UpdateAthleteProfileDto) {
    return this.service.updateProfile(actor, userId, dto);
  }
}
