import { Controller, Post, Get, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AthleteEvaluationService } from './athlete-evaluation.service';
import { CreateEvaluationDto, UpdateAthleteProfileDto } from './dto/create-evaluation.dto';

@Controller('athlete-evaluations')
@UseGuards(AuthGuard('jwt'))
export class AthleteEvaluationController {
  constructor(private readonly service: AthleteEvaluationService) {}

  @Post(':userId')
  createEvaluation(
    @Param('userId') userId: string,
    @Body() dto: CreateEvaluationDto,
  ) {
    return this.service.createEvaluation(userId, dto);
  }

  @Get(':userId')
  getHistory(@Param('userId') userId: string) {
    return this.service.getHistory(userId);
  }

  @Get(':userId/current')
  getCurrent(@Param('userId') userId: string) {
    return this.service.getCurrent(userId);
  }

  @Get(':userId/profile')
  getProfile(@Param('userId') userId: string) {
    return this.service.getAthleteProfile(userId);
  }

  @Patch(':userId/profile')
  updateProfile(
    @Param('userId') userId: string,
    @Body() dto: UpdateAthleteProfileDto,
  ) {
    return this.service.updateProfile(userId, dto);
  }
}
