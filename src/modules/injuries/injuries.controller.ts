import { Controller, Post, Get, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { InjuriesService } from './injuries.service';
import { CreateInjuryDto, UpdateInjuryStatusDto } from './dto/injury.dto';

@Controller('injuries')
@UseGuards(AuthGuard('jwt'))
export class InjuriesController {
  constructor(private readonly service: InjuriesService) {}

  @Post(':userId')
  create(
    @Param('userId') userId: string,
    @Body() dto: CreateInjuryDto,
  ) {
    return this.service.create(userId, dto);
  }

  @Get(':userId')
  findByUser(@Param('userId') userId: string) {
    return this.service.findByUser(userId);
  }

  @Patch(':injuryId/status')
  updateStatus(
    @Param('injuryId') injuryId: string,
    @Body() dto: UpdateInjuryStatusDto,
  ) {
    return this.service.updateStatus(injuryId, dto);
  }

  @Get(':userId/active-tags')
  getActiveTags(@Param('userId') userId: string) {
    return this.service.getActiveTags(userId);
  }
}
