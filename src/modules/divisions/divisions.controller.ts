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
import { DivisionsService } from './divisions.service';
import { GetUser } from '../auth/get-user.decorator';
import { User } from '../../entities/user.entity';
import { ParseSanitizedUUIDPipe } from 'src/common/pipes/parse-sanitized-uuid.pipe';

@Controller('divisions')
@UseGuards(AuthGuard('jwt'))
export class DivisionsController {
  constructor(private readonly divisionsService: DivisionsService) {}

  @Get('company/:companyId')
  listByCompany(@Param('companyId', ParseSanitizedUUIDPipe) companyId: string) {
    return this.divisionsService.listByCompany(companyId);
  }

  @Post('company/:companyId')
  create(
    @GetUser() actor: User,
    @Param('companyId', ParseSanitizedUUIDPipe) companyId: string,
    @Body() dto: { name: string; description?: string },
  ) {
    return this.divisionsService.create(actor, companyId, dto);
  }

  @Put(':id')
  update(
    @GetUser() actor: User,
    @Param('id', ParseSanitizedUUIDPipe) id: string,
    @Body() dto: { name?: string; description?: string },
  ) {
    return this.divisionsService.update(actor, id, dto);
  }

  @Delete(':id')
  remove(
    @GetUser() actor: User,
    @Param('id', ParseSanitizedUUIDPipe) id: string,
  ) {
    return this.divisionsService.remove(actor, id);
  }

  @Post(':id/coaches')
  addCoach(
    @GetUser() actor: User,
    @Param('id', ParseSanitizedUUIDPipe) id: string,
    @Body() dto: { coachId: string },
  ) {
    return this.divisionsService.addCoach(actor, id, dto.coachId);
  }

  @Delete(':id/coaches/:coachId')
  removeCoach(
    @GetUser() actor: User,
    @Param('id', ParseSanitizedUUIDPipe) id: string,
    @Param('coachId', ParseSanitizedUUIDPipe) coachId: string,
  ) {
    return this.divisionsService.removeCoach(actor, id, coachId);
  }

  @Put(':id/athletes/:athleteUserId')
  assignAthlete(
    @GetUser() actor: User,
    @Param('id', ParseSanitizedUUIDPipe) id: string,
    @Param('athleteUserId', ParseSanitizedUUIDPipe) athleteUserId: string,
  ) {
    return this.divisionsService.assignAthlete(actor, id, athleteUserId);
  }

  @Delete(':id/athletes/:athleteUserId')
  removeAthleteFromDivision(
    @GetUser() actor: User,
    @Param('id', ParseSanitizedUUIDPipe) id: string,
    @Param('athleteUserId', ParseSanitizedUUIDPipe) athleteUserId: string,
  ) {
    return this.divisionsService.removeAthleteFromDivision(actor, id, athleteUserId);
  }
}
