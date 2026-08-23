import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AthleteObjectivesService } from './athlete-objectives.service';
import {
  CreateAthleteObjectiveDto,
  UpdateAthleteObjectiveDto,
} from './dto/athlete-objective.dto';

@Controller('athlete-objectives')
@UseGuards(AuthGuard('jwt'))
export class AthleteObjectivesController {
  constructor(private readonly service: AthleteObjectivesService) {}

  @Post(':userId')
  create(@Param('userId') userId: string, @Body() dto: CreateAthleteObjectiveDto) {
    return this.service.create(userId, dto);
  }

  @Get(':userId')
  findByUser(@Param('userId') userId: string) {
    return this.service.findByUser(userId);
  }

  @Patch(':objectiveId')
  update(
    @Param('objectiveId') objectiveId: string,
    @Body() dto: UpdateAthleteObjectiveDto,
  ) {
    return this.service.update(objectiveId, dto);
  }

  @Delete(':objectiveId')
  remove(@Param('objectiveId') objectiveId: string) {
    return this.service.remove(objectiveId);
  }
}
