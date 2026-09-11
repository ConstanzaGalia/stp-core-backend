import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UserRole } from 'src/common/enums/enums';
import { GetUser } from '../auth/get-user.decorator';
import { User } from 'src/entities/user.entity';
import { TrainingPlannerService } from './training-planner.service';
import { CompanyService } from '../company/company.service';

const STAFF_ROLES = [
  UserRole.STP_ADMIN,
  UserRole.DIRECTOR,
  UserRole.TRAINER,
  UserRole.SUB_TRAINER,
  UserRole.SECRETARIA,
];

@Controller('training-planner')
@UseGuards(AuthGuard('jwt'))
export class TrainingPlannerController {
  constructor(
    private readonly service: TrainingPlannerService,
    private readonly companyService: CompanyService,
  ) {}

  private assertCanModify(user: User): void {
    if (user.role === UserRole.SECRETARIA) {
      throw new ForbiddenException(
        'El rol Secretaría solo puede consultar entrenamientos.',
      );
    }
  }

  private async assertStaffBelongsToCompany(
    user: User,
    companyId: string,
  ): Promise<void> {
    if (!STAFF_ROLES.includes(user.role)) {
      throw new ForbiddenException(
        'No tienes permiso para consultar inactividad de este centro',
      );
    }
    if (user.role === UserRole.STP_ADMIN) {
      return;
    }
    const companies = await this.companyService.findCompaniesByUser(user.id);
    const belongs = companies.some((c) => c.id === companyId);
    if (!belongs) {
      throw new ForbiddenException('No perteneces a este centro');
    }
  }

  // ── Training Profile ──────────────────────────────────────────────────────

  /** GET /training-planner/profiles/:athleteId */
  @Get('profiles/:athleteId')
  getProfile(@Param('athleteId') athleteId: string) {
    return this.service.ensureProfile(athleteId);
  }

  /** PUT /training-planner/profiles/:athleteId */
  @Put('profiles/:athleteId')
  saveProfile(
    @Param('athleteId') athleteId: string,
    @Body() body: any,
    @GetUser() user: User,
  ) {
    this.assertCanModify(user);
    return this.service.saveProfile(athleteId, body);
  }

  // ── Macro Plan ────────────────────────────────────────────────────────────

  /** GET /training-planner/macro-plans/all?athleteId= — lista todos los planes del atleta */
  @Get('macro-plans/all')
  getAllMacroPlans(@Query('athleteId') athleteId: string) {
    return this.service.getAllMacroPlans(athleteId);
  }

  /** GET /training-planner/macro-plans?athleteId= */
  @Get('macro-plans')
  getMacroPlan(@Query('athleteId') athleteId: string) {
    return this.service.getMacroPlan(athleteId);
  }

  /** POST /training-planner/macro-plans */
  @Post('macro-plans')
  saveMacroPlan(@Body() body: any, @GetUser() user: User) {
    this.assertCanModify(user);
    return this.service.saveMacroPlan(body);
  }

  /** PUT /training-planner/macro-plans/:id/weeks */
  @Put('macro-plans/:id/weeks')
  updateMacroPlanWeeks(
    @Param('id') id: string,
    @Body() body: any,
    @GetUser() user: User,
  ) {
    this.assertCanModify(user);
    return this.service.updateMacroPlanWeeks(id, body);
  }

  // ── Weekly Template ───────────────────────────────────────────────────────

  /** GET /training-planner/weekly-templates?athleteId=&phase=&weekType=&weeklyFrequency= */
  @Get('weekly-templates')
  getWeeklyTemplate(
    @Query('athleteId') athleteId: string,
    @Query('phase') phase: string,
    @Query('weekType') weekType: string,
    @Query('weeklyFrequency') weeklyFrequency: string,
  ) {
    return this.service.getWeeklyTemplate(
      athleteId,
      phase,
      weekType,
      Number(weeklyFrequency) || 3,
    );
  }

  /** POST /training-planner/weekly-templates */
  @Post('weekly-templates')
  saveWeeklyTemplate(@Body() body: any, @GetUser() user: User) {
    this.assertCanModify(user);
    return this.service.saveWeeklyTemplate(body);
  }

  // ── Sessions ──────────────────────────────────────────────────────────────

  /** GET /training-planner/company/:companyId/planning-gaps?days=7 */
  @Get('company/:companyId/planning-gaps')
  getPlanningGaps(
    @Param('companyId') companyId: string,
    @Query('days') days?: string,
  ) {
    const parsedDays = Number(days);
    const thresholdDays =
      Number.isFinite(parsedDays) && parsedDays > 0 ? parsedDays : 7;
    return this.service.getPlanningGaps(companyId, thresholdDays);
  }

  /** GET /training-planner/company/:companyId/training-inactivity */
  @Get('company/:companyId/training-inactivity')
  async getTrainingInactivity(
    @Param('companyId') companyId: string,
    @GetUser() user: User,
  ) {
    await this.assertStaffBelongsToCompany(user, companyId);
    return this.service.getTrainingInactivity(companyId, user);
  }

  /** GET /training-planner/sessions?athleteId=&macroWeekId= */
  @Get('sessions')
  listSessions(
    @Query('athleteId') athleteId: string,
    @Query('macroWeekId') macroWeekId: string | undefined,
    @GetUser() user: User,
  ) {
    const includePrivate = user.role !== UserRole.ATHLETE;
    return this.service.listSessions(athleteId, macroWeekId ?? null, includePrivate);
  }

  /** GET /training-planner/sessions/:id?athleteId= */
  @Get('sessions/:id')
  getSession(
    @Param('id') id: string,
    @Query('athleteId') athleteId: string,
    @GetUser() user: User,
  ) {
    const includePrivate = user.role !== UserRole.ATHLETE;
    return this.service.getSession(athleteId, id, includePrivate);
  }

  /** POST /training-planner/sessions — create or upsert */
  @Post('sessions')
  saveSession(@Body() body: any, @GetUser() user: User) {
    this.assertCanModify(user);
    return this.service.saveSession(body, user);
  }

  /** PUT /training-planner/sessions/:id — explicit update */
  @Put('sessions/:id')
  updateSession(@Param('id') id: string, @Body() body: any, @GetUser() user: User) {
    this.assertCanModify(user);
    return this.service.saveSession({ ...body, id }, user);
  }

  /** DELETE /training-planner/sessions/:id?athleteId= */
  @Delete('sessions/:id')
  deleteSession(
    @Param('id') id: string,
    @Query('athleteId') athleteId: string,
    @GetUser() user: User,
  ) {
    this.assertCanModify(user);
    return this.service.deleteSession(athleteId, id);
  }

  /** PATCH /training-planner/sessions/:id/feedback/draft — borrador parcial */
  @Patch('sessions/:id/feedback/draft')
  saveFeedbackDraft(
    @Param('id') sessionId: string,
    @Body() body: any,
    @GetUser() user: User,
  ) {
    this.assertCanModify(user);
    return this.service.mergeSessionFeedback(sessionId, {
      ...body,
      mode: 'draft',
    });
  }

  /** POST /training-planner/sessions/:id/feedback/block — envío por circuito */
  @Post('sessions/:id/feedback/block')
  submitBlockFeedback(
    @Param('id') sessionId: string,
    @Body() body: any,
    @GetUser() user: User,
  ) {
    this.assertCanModify(user);
    return this.service.mergeSessionFeedback(sessionId, {
      ...body,
      mode: 'block',
    });
  }

  /** POST /training-planner/sessions/:id/feedback — envío final de sesión */
  @Post('sessions/:id/feedback')
  submitFeedback(
    @Param('id') sessionId: string,
    @Body() body: any,
    @GetUser() user: User,
  ) {
    this.assertCanModify(user);
    // Compat: si el body trae blocks/feedbackStatus (payload viejo de sesión completa), usar saveSession
    if (body?.blocks != null || body?.feedbackStatus != null) {
      return this.service.saveSession({ ...body, id: sessionId });
    }
    return this.service.mergeSessionFeedback(sessionId, {
      ...body,
      mode: 'final',
    });
  }

  /** POST /training-planner/sessions/:id/feedback/withdraw — deshacer envío (solo pending_review) */
  @Post('sessions/:id/feedback/withdraw')
  withdrawFeedback(
    @Param('id') sessionId: string,
    @Body() body: any,
    @GetUser() user: User,
  ) {
    this.assertCanModify(user);
    return this.service.withdrawSessionFeedback(sessionId, body?.athleteId);
  }

  /** POST /training-planner/sessions/:id/review */
  @Post('sessions/:id/review')
  reviewFeedback(@Param('id') sessionId: string, @Body() body: any, @GetUser() user: User) {
    this.assertCanModify(user);
    return this.service.saveSession({ ...body, id: sessionId }, user);
  }
}
