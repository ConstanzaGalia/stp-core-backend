import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SportPositionsService } from './sport-positions.service';
import { GetUser } from '../auth/get-user.decorator';
import { User } from '../../entities/user.entity';
import { ParseSanitizedUUIDPipe } from 'src/common/pipes/parse-sanitized-uuid.pipe';

@Controller('sport-positions')
@UseGuards(AuthGuard('jwt'))
export class SportPositionsController {
  constructor(private readonly sportPositionsService: SportPositionsService) {}

  @Get('company/:companyId')
  listByCompany(
    @GetUser() actor: User,
    @Param('companyId', ParseSanitizedUUIDPipe) companyId: string,
  ) {
    return this.sportPositionsService.listByCompany(companyId, actor);
  }

  @Post('company/:companyId')
  create(
    @GetUser() actor: User,
    @Param('companyId', ParseSanitizedUUIDPipe) companyId: string,
    @Body() dto: { name: string; description?: string },
  ) {
    return this.sportPositionsService.create(actor, companyId, dto);
  }

  @Put(':id')
  update(
    @GetUser() actor: User,
    @Param('id', ParseSanitizedUUIDPipe) id: string,
    @Body() dto: { name?: string; description?: string },
  ) {
    return this.sportPositionsService.update(actor, id, dto);
  }

  @Delete(':id')
  remove(
    @GetUser() actor: User,
    @Param('id', ParseSanitizedUUIDPipe) id: string,
  ) {
    return this.sportPositionsService.remove(actor, id);
  }

  @Put(':id/athletes/:athleteUserId')
  assignAthlete(
    @GetUser() actor: User,
    @Param('id', ParseSanitizedUUIDPipe) id: string,
    @Param('athleteUserId', ParseSanitizedUUIDPipe) athleteUserId: string,
  ) {
    return this.sportPositionsService.assignAthlete(actor, id, athleteUserId);
  }

  @Delete(':id/athletes/:athleteUserId')
  removeAthleteFromPosition(
    @GetUser() actor: User,
    @Param('id', ParseSanitizedUUIDPipe) id: string,
    @Param('athleteUserId', ParseSanitizedUUIDPipe) athleteUserId: string,
  ) {
    return this.sportPositionsService.removeAthleteFromPosition(actor, id, athleteUserId);
  }
}
