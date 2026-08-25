import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GetUser } from '../auth/get-user.decorator';
import { User } from '../../entities/user.entity';
import { ParseSanitizedUUIDPipe } from 'src/common/pipes/parse-sanitized-uuid.pipe';
import { CompetitionStatus } from '../../entities/competition.entity';
import { CompetitionsService } from './competitions.service';
import {
  CreateCompetitionDto,
  UpdateCompetitionDto,
  UpdateCompetitionResultDto,
} from './dto/competition.dto';

@Controller('competitions')
@UseGuards(AuthGuard('jwt'))
export class CompetitionsController {
  constructor(private readonly competitionsService: CompetitionsService) {}

  @Get('company/:companyId')
  listByCompany(
    @GetUser() actor: User,
    @Param('companyId', ParseSanitizedUUIDPipe) companyId: string,
    @Query('status') status?: CompetitionStatus,
    @Query('sport') sport?: string,
    @Query('divisionId') divisionId?: string,
  ) {
    return this.competitionsService.listByCompany(actor, companyId, {
      status,
      sport,
      divisionId,
    });
  }

  @Get('company/:companyId/available-athletes')
  getAvailableAthletes(
    @GetUser() actor: User,
    @Param('companyId', ParseSanitizedUUIDPipe) companyId: string,
    @Query('divisionIds') divisionIds?: string,
  ) {
    const ids = divisionIds
      ? divisionIds.split(',').map((id) => id.trim()).filter(Boolean)
      : undefined;
    return this.competitionsService.getAvailableAthletes(actor, companyId, ids);
  }

  @Post('company/:companyId')
  create(
    @GetUser() actor: User,
    @Param('companyId', ParseSanitizedUUIDPipe) companyId: string,
    @Body() dto: CreateCompetitionDto,
  ) {
    return this.competitionsService.create(actor, companyId, dto);
  }

  @Get(':id')
  getOne(
    @GetUser() actor: User,
    @Param('id', ParseSanitizedUUIDPipe) id: string,
  ) {
    return this.competitionsService.getOne(actor, id);
  }

  @Put(':id')
  update(
    @GetUser() actor: User,
    @Param('id', ParseSanitizedUUIDPipe) id: string,
    @Body() dto: UpdateCompetitionDto,
  ) {
    return this.competitionsService.update(actor, id, dto);
  }

  @Patch(':id/result')
  updateResult(
    @GetUser() actor: User,
    @Param('id', ParseSanitizedUUIDPipe) id: string,
    @Body() dto: UpdateCompetitionResultDto,
  ) {
    return this.competitionsService.updateResult(actor, id, dto);
  }

  @Delete(':id')
  remove(
    @GetUser() actor: User,
    @Param('id', ParseSanitizedUUIDPipe) id: string,
  ) {
    return this.competitionsService.remove(actor, id);
  }
}
