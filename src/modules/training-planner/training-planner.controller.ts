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

@Controller('training-planner')
@UseGuards(AuthGuard('jwt'))
export class TrainingPlannerController {
  constructor(private readonly service: TrainingPlannerService) {}

  private assertCanModify(user: User): void {
    if (user.role === UserRole.SECRETARIA) {
      throw new ForbiddenException(
        'El rol Secretaría solo puede consultar entrenamientos.',
      );
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
