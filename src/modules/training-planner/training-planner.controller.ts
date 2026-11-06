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
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UserRole } from 'src/common/enums/enums';
import { GetUser } from '../auth/get-user.decorator';
import { User } from 'src/entities/user.entity';
import { TrainingPlannerService } from './training-planner.service';
import { GroupProgramService } from './group-program.service';
import {
  CreateGroupProgramDto,
  EnrollGroupProgramDto,
  ReplaceGroupProgramSlotsDto,
  TransferGroupProgramDto,
  UpdateGroupProgramDto,
} from './dto/group-program.dto';
import {
  CreateWorkoutTemplateDto,
  InstantiateWorkoutTemplateDto,
  PublishSessionDto,
  UpdateAthleteOwnProgressDto,
  UpdateSessionCompletionDto,
  UpdateWorkoutTemplateDto,
  CreateWorkoutCollectionDto,
  UpdateWorkoutCollectionDto,
  ImportWorkoutCsvPreviewDto,
  ImportWorkoutCsvConfirmDto,
} from './dto/workout-template.dto';

@Controller('training-planner')
@UseGuards(AuthGuard('jwt'))
export class TrainingPlannerController {
  constructor(
    private readonly service: TrainingPlannerService,
    private readonly groupPrograms: GroupProgramService,
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
    await this.service.assertStaffBelongsToCompany(user, companyId);
  }

  // ── Training Profile ──────────────────────────────────────────────────────

  /** GET /training-planner/profiles/:athleteId */
  @Get('profiles/:athleteId')
  async getProfile(
    @Param('athleteId') athleteId: string,
    @GetUser() user: User,
  ) {
    await this.service.assertCanAccessTrainingAthlete(user, athleteId, false);
    return this.service.ensureProfile(athleteId);
  }

  /** PUT /training-planner/profiles/:athleteId */
  @Put('profiles/:athleteId')
  async saveProfile(
    @Param('athleteId') athleteId: string,
    @Body() body: any,
    @GetUser() user: User,
  ) {
    this.assertCanModify(user);
    await this.service.assertCanAccessTrainingAthlete(user, athleteId, true);
    return this.service.saveProfile(athleteId, body);
  }

  // ── Macro Plan ────────────────────────────────────────────────────────────

  @Get('macro-plans/all')
  async getAllMacroPlans(
    @Query('athleteId') athleteId: string,
    @GetUser() user: User,
  ) {
    await this.service.assertCanAccessTrainingAthlete(user, athleteId, false);
    return this.service.getAllMacroPlans(athleteId);
  }

  @Get('macro-plans')
  async getMacroPlan(
    @Query('athleteId') athleteId: string,
    @GetUser() user: User,
  ) {
    await this.service.assertCanAccessTrainingAthlete(user, athleteId, false);
    return this.service.getMacroPlan(athleteId);
  }

  @Post('macro-plans')
  async saveMacroPlan(@Body() body: any, @GetUser() user: User) {
    this.assertCanModify(user);
    await this.service.assertCanAccessTrainingAthlete(user, body.athleteId, true);
    return this.service.saveMacroPlan(body);
  }

  @Put('macro-plans/:id/weeks')
  async updateMacroPlanWeeks(
    @Param('id') id: string,
    @Body() body: any,
    @GetUser() user: User,
  ) {
    this.assertCanModify(user);
    return this.service.updateMacroPlanWeeks(id, body);
  }

  // ── Weekly Template ───────────────────────────────────────────────────────

  @Get('weekly-templates')
  async getWeeklyTemplate(
    @Query('athleteId') athleteId: string,
    @Query('phase') phase: string,
    @Query('weekType') weekType: string,
    @Query('weeklyFrequency') weeklyFrequency: string,
    @GetUser() user: User,
  ) {
    await this.service.assertCanAccessTrainingAthlete(user, athleteId, false);
    return this.service.getWeeklyTemplate(
      athleteId,
      phase,
      weekType,
      Number(weeklyFrequency) || 3,
    );
  }

  @Post('weekly-templates')
  async saveWeeklyTemplate(@Body() body: any, @GetUser() user: User) {
    this.assertCanModify(user);
    await this.service.assertCanAccessTrainingAthlete(user, body.athleteId, true);
    return this.service.saveWeeklyTemplate(body);
  }

  // ── Workout Collections (carpetas) ─────────────────────────────────────────

  @Get('company/:companyId/workout-collections')
  async listWorkoutCollections(
    @Param('companyId') companyId: string,
    @GetUser() user: User,
  ) {
    await this.assertStaffBelongsToCompany(user, companyId);
    return this.service.listWorkoutCollections(companyId);
  }

  @Post('company/:companyId/workout-collections')
  async createWorkoutCollection(
    @Param('companyId') companyId: string,
    @Body() body: CreateWorkoutCollectionDto,
    @GetUser() user: User,
  ) {
    this.assertCanModify(user);
    await this.assertStaffBelongsToCompany(user, companyId);
    return this.service.createWorkoutCollection(companyId, body, user);
  }

  @Put('company/:companyId/workout-collections/:collectionId')
  async updateWorkoutCollection(
    @Param('companyId') companyId: string,
    @Param('collectionId') collectionId: string,
    @Body() body: UpdateWorkoutCollectionDto,
    @GetUser() user: User,
  ) {
    this.assertCanModify(user);
    await this.assertStaffBelongsToCompany(user, companyId);
    return this.service.updateWorkoutCollection(
      companyId,
      collectionId,
      body,
      user,
    );
  }

  @Delete('company/:companyId/workout-collections/:collectionId')
  async deleteWorkoutCollection(
    @Param('companyId') companyId: string,
    @Param('collectionId') collectionId: string,
    @GetUser() user: User,
  ) {
    this.assertCanModify(user);
    await this.assertStaffBelongsToCompany(user, companyId);
    return this.service.deleteWorkoutCollection(companyId, collectionId, user);
  }

  // ── Workout Templates (biblioteca) ────────────────────────────────────────

  @Get('company/:companyId/workout-templates')
  async listWorkoutTemplates(
    @Param('companyId') companyId: string,
    @GetUser() user: User,
  ) {
    await this.assertStaffBelongsToCompany(user, companyId);
    return this.service.listWorkoutTemplates(companyId);
  }

  @Get('company/:companyId/workout-templates/:templateId')
  async getWorkoutTemplate(
    @Param('companyId') companyId: string,
    @Param('templateId') templateId: string,
    @GetUser() user: User,
  ) {
    await this.assertStaffBelongsToCompany(user, companyId);
    return this.service.getWorkoutTemplate(companyId, templateId);
  }

  @Post('company/:companyId/workout-templates')
  async createWorkoutTemplate(
    @Param('companyId') companyId: string,
    @Body() body: CreateWorkoutTemplateDto,
    @GetUser() user: User,
  ) {
    this.assertCanModify(user);
    await this.assertStaffBelongsToCompany(user, companyId);
    return this.service.createWorkoutTemplate(companyId, body, user);
  }

  @Post('company/:companyId/workout-templates/import-preview')
  async importWorkoutCsvPreview(
    @Param('companyId') companyId: string,
    @Body() body: ImportWorkoutCsvPreviewDto,
    @GetUser() user: User,
  ) {
    this.assertCanModify(user);
    await this.assertStaffBelongsToCompany(user, companyId);
    if (!body?.csvText?.trim()) {
      throw new BadRequestException('csvText es requerido.');
    }
    return this.service.previewWorkoutCsvImport(companyId, body.csvText);
  }

  @Post('company/:companyId/workout-templates/import-confirm')
  async importWorkoutCsvConfirm(
    @Param('companyId') companyId: string,
    @Body() body: ImportWorkoutCsvConfirmDto,
    @GetUser() user: User,
  ) {
    this.assertCanModify(user);
    await this.assertStaffBelongsToCompany(user, companyId);
    return this.service.confirmWorkoutCsvImport(companyId, body, user);
  }

  @Put('company/:companyId/workout-templates/:templateId')
  async updateWorkoutTemplate(
    @Param('companyId') companyId: string,
    @Param('templateId') templateId: string,
    @Body() body: UpdateWorkoutTemplateDto,
    @GetUser() user: User,
  ) {
    this.assertCanModify(user);
    await this.assertStaffBelongsToCompany(user, companyId);
    return this.service.updateWorkoutTemplate(companyId, templateId, body, user);
  }

  @Delete('company/:companyId/workout-templates/:templateId')
  async deleteWorkoutTemplate(
    @Param('companyId') companyId: string,
    @Param('templateId') templateId: string,
    @GetUser() user: User,
  ) {
    this.assertCanModify(user);
    await this.assertStaffBelongsToCompany(user, companyId);
    return this.service.deleteWorkoutTemplate(companyId, templateId, user);
  }

  @Post('company/:companyId/workout-templates/:templateId/instantiate')
  async instantiateWorkoutTemplate(
    @Param('companyId') companyId: string,
    @Param('templateId') templateId: string,
    @Body() body: InstantiateWorkoutTemplateDto,
    @GetUser() user: User,
  ) {
    this.assertCanModify(user);
    await this.assertStaffBelongsToCompany(user, companyId);
    return this.service.instantiateWorkoutTemplate(
      companyId,
      templateId,
      body,
      user,
    );
  }

  // ── Company ops ───────────────────────────────────────────────────────────

  @Get('company/:companyId/planning-gaps')
  async getPlanningGaps(
    @Param('companyId') companyId: string,
    @Query('days') days: string | undefined,
    @GetUser() user: User,
  ) {
    await this.assertStaffBelongsToCompany(user, companyId);
    const parsedDays = Number(days);
    const thresholdDays =
      Number.isFinite(parsedDays) && parsedDays > 0 ? parsedDays : 7;
    return this.service.getPlanningGaps(companyId, thresholdDays);
  }

  @Get('company/:companyId/training-inactivity')
  async getTrainingInactivity(
    @Param('companyId') companyId: string,
    @GetUser() user: User,
  ) {
    await this.assertStaffBelongsToCompany(user, companyId);
    return this.service.getTrainingInactivity(companyId, user);
  }

  // ── Sessions ──────────────────────────────────────────────────────────────

  @Get('sessions')
  async listSessions(
    @Query('athleteId') athleteId: string,
    @Query('macroWeekId') macroWeekId: string | undefined,
    @Query('view') view: string | undefined,
    @GetUser() user: User,
  ) {
    await this.service.assertCanAccessTrainingAthlete(user, athleteId, false);
    const includePrivate = user.role !== UserRole.ATHLETE;
    const sessionView = view === 'summary' ? 'summary' : 'full';
    return this.service.listSessions(
      athleteId,
      macroWeekId ?? null,
      includePrivate,
      sessionView,
    );
  }

  /** Bootstrap planner: profile + macro + sessions summary (+ active tags). */
  @Get('athletes/:athleteId/bootstrap')
  async getPlannerBootstrap(
    @Param('athleteId') athleteId: string,
    @GetUser() user: User,
  ) {
    await this.service.assertCanAccessTrainingAthlete(user, athleteId, false);
    const includePrivate = user.role !== UserRole.ATHLETE;
    return this.service.getPlannerBootstrap(athleteId, includePrivate);
  }

  /** Último / máximo de carga por ejercicio del atleta. */
  @Get('athletes/:athleteId/exercise-history')
  async getExerciseHistory(
    @Param('athleteId') athleteId: string,
    @Query('excludeDate') excludeDate: string | undefined,
    @Query('excludeSessionId') excludeSessionId: string | undefined,
    @GetUser() user: User,
  ) {
    await this.service.assertCanAccessTrainingAthlete(user, athleteId, false);
    const includePrivate = user.role !== UserRole.ATHLETE;
    return this.service.getExerciseHistory(athleteId, includePrivate, {
      excludeDate,
      excludeSessionId,
    });
  }

  @Get('sessions/:id')
  async getSession(
    @Param('id') id: string,
    @Query('athleteId') athleteId: string,
    @GetUser() user: User,
  ) {
    await this.service.assertCanAccessTrainingAthlete(user, athleteId, false);
    const includePrivate = user.role !== UserRole.ATHLETE;
    return this.service.getSession(athleteId, id, includePrivate);
  }

  @Post('sessions')
  async saveSession(@Body() body: any, @GetUser() user: User) {
    this.assertCanModify(user);
    await this.service.assertCanAccessTrainingAthlete(user, body.athleteId, true);
    return this.service.saveSession(body, user);
  }

  @Put('sessions/:id')
  async updateSession(
    @Param('id') id: string,
    @Body() body: any,
    @GetUser() user: User,
  ) {
    this.assertCanModify(user);
    await this.service.assertCanAccessTrainingAthlete(user, body.athleteId, true);
    return this.service.saveSession({ ...body, id }, user);
  }

  @Delete('sessions/:id')
  async deleteSession(
    @Param('id') id: string,
    @Query('athleteId') athleteId: string,
    @GetUser() user: User,
  ) {
    this.assertCanModify(user);
    await this.service.assertCanAccessTrainingAthlete(user, athleteId, true);
    return this.service.deleteSession(athleteId, id, user);
  }

  @Post('sessions/:id/restore')
  async restoreSession(
    @Param('id') id: string,
    @Query('athleteId') athleteId: string,
    @GetUser() user: User,
  ) {
    this.assertCanModify(user);
    await this.service.assertCanAccessTrainingAthlete(user, athleteId, true);
    return this.service.restoreSession(athleteId, id, user);
  }

  @Post('sessions/:id/publish')
  async publishSession(
    @Param('id') sessionId: string,
    @Body() body: PublishSessionDto,
    @GetUser() user: User,
  ) {
    this.assertCanModify(user);
    return this.service.publishSession(sessionId, body.athleteId, user);
  }

  @Patch('sessions/:id/completion')
  async updateCompletion(
    @Param('id') sessionId: string,
    @Body() body: UpdateSessionCompletionDto,
    @GetUser() user: User,
  ) {
    this.assertCanModify(user);
    return this.service.updateSessionCompletion(
      sessionId,
      body.athleteId,
      body.athleteCompletionStatus,
      user,
    );
  }

  /** Asistencia / circuitos del propio atleta (no usa saveSession ni write de planilla). */
  @Patch('sessions/:id/athlete-progress')
  async patchAthleteProgress(
    @Param('id') sessionId: string,
    @Body() body: UpdateAthleteOwnProgressDto,
    @GetUser() user: User,
  ) {
    return this.service.patchAthleteOwnProgress(sessionId, body, user);
  }

  @Post('sessions/:id/validate-safety')
  async validateSafety(
    @Param('id') sessionId: string,
    @Body() body: { athleteId: string },
    @GetUser() user: User,
  ) {
    await this.service.assertCanAccessTrainingAthlete(user, body.athleteId, false);
    return this.service.validateSessionSafety(sessionId, body.athleteId);
  }

  @Patch('sessions/:id/feedback/draft')
  saveFeedbackDraft(
    @Param('id') sessionId: string,
    @Body() body: any,
    @GetUser() user: User,
  ) {
    // Atleta puede guardar borrador de su feedback; staff también
    if (user.role === UserRole.SECRETARIA) {
      throw new ForbiddenException(
        'El rol Secretaría solo puede consultar entrenamientos.',
      );
    }
    return this.service.mergeSessionFeedback(sessionId, {
      ...body,
      mode: 'draft',
    });
  }

  @Post('sessions/:id/feedback/block')
  submitBlockFeedback(
    @Param('id') sessionId: string,
    @Body() body: any,
  ) {
    return this.service.mergeSessionFeedback(sessionId, {
      ...body,
      mode: 'block',
    });
  }

  @Post('sessions/:id/feedback')
  submitFeedback(
    @Param('id') sessionId: string,
    @Body() body: any,
    @GetUser() user: User,
  ) {
    if (body?.blocks != null || body?.feedbackStatus != null) {
      this.assertCanModify(user);
      return this.service.saveSession({ ...body, id: sessionId }, user);
    }
    return this.service.mergeSessionFeedback(sessionId, {
      ...body,
      mode: 'final',
    });
  }

  @Post('sessions/:id/feedback/withdraw')
  withdrawFeedback(
    @Param('id') sessionId: string,
    @Body() body: any,
  ) {
    return this.service.withdrawSessionFeedback(sessionId, body?.athleteId);
  }

  @Post('sessions/:id/review')
  async reviewFeedback(
    @Param('id') sessionId: string,
    @Body() body: any,
    @GetUser() user: User,
  ) {
    this.assertCanModify(user);
    await this.service.assertCanAccessTrainingAthlete(user, body.athleteId, true);
    return this.service.saveSession({ ...body, id: sessionId }, user);
  }

  // ── Programas grupales ────────────────────────────────────────────────────

  @Get('company/:companyId/group-programs')
  async listGroupPrograms(
    @Param('companyId') companyId: string,
    @GetUser() user: User,
  ) {
    await this.service.assertStaffBelongsToCompany(user, companyId);
    return this.groupPrograms.listPrograms(companyId);
  }

  @Get('company/:companyId/group-programs/:programId')
  async getGroupProgram(
    @Param('companyId') companyId: string,
    @Param('programId') programId: string,
    @GetUser() user: User,
  ) {
    await this.service.assertStaffBelongsToCompany(user, companyId);
    return this.groupPrograms.getProgramDetail(companyId, programId);
  }

  @Post('company/:companyId/group-programs')
  async createGroupProgram(
    @Param('companyId') companyId: string,
    @Body() body: CreateGroupProgramDto,
    @GetUser() user: User,
  ) {
    this.assertCanModify(user);
    await this.service.assertStaffBelongsToCompany(user, companyId);
    return this.groupPrograms.createProgram(companyId, body, user);
  }

  @Put('company/:companyId/group-programs/:programId')
  async updateGroupProgram(
    @Param('companyId') companyId: string,
    @Param('programId') programId: string,
    @Body() body: UpdateGroupProgramDto,
    @GetUser() user: User,
  ) {
    this.assertCanModify(user);
    await this.service.assertStaffBelongsToCompany(user, companyId);
    return this.groupPrograms.updateProgram(companyId, programId, body, user);
  }

  @Put('company/:companyId/group-programs/:programId/slots')
  async replaceGroupProgramSlots(
    @Param('companyId') companyId: string,
    @Param('programId') programId: string,
    @Body() body: ReplaceGroupProgramSlotsDto,
    @GetUser() user: User,
  ) {
    this.assertCanModify(user);
    await this.service.assertStaffBelongsToCompany(user, companyId);
    return this.groupPrograms.replaceSlots(companyId, programId, body, user);
  }

  @Post('company/:companyId/group-programs/:programId/enrollments')
  async enrollGroupProgram(
    @Param('companyId') companyId: string,
    @Param('programId') programId: string,
    @Body() body: EnrollGroupProgramDto,
    @GetUser() user: User,
  ) {
    this.assertCanModify(user);
    await this.service.assertStaffBelongsToCompany(user, companyId);
    return this.groupPrograms.enrollAthletes(companyId, programId, body, user);
  }

  @Delete('company/:companyId/group-programs/:programId/enrollments/:athleteId')
  async removeGroupProgramEnrollment(
    @Param('companyId') companyId: string,
    @Param('programId') programId: string,
    @Param('athleteId') athleteId: string,
    @GetUser() user: User,
  ) {
    this.assertCanModify(user);
    await this.service.assertStaffBelongsToCompany(user, companyId);
    return this.groupPrograms.removeEnrollment(
      companyId,
      programId,
      athleteId,
      user,
    );
  }

  @Post(
    'company/:companyId/group-programs/:programId/enrollments/:athleteId/transfer',
  )
  async transferGroupProgramEnrollment(
    @Param('companyId') companyId: string,
    @Param('programId') programId: string,
    @Param('athleteId') athleteId: string,
    @Body() body: TransferGroupProgramDto,
    @GetUser() user: User,
  ) {
    this.assertCanModify(user);
    await this.service.assertStaffBelongsToCompany(user, companyId);
    return this.groupPrograms.transferAthlete(
      companyId,
      programId,
      athleteId,
      body,
      user,
    );
  }

  @Post('company/:companyId/group-programs/:programId/weeks/:weekIndex/publish')
  async publishGroupProgramWeek(
    @Param('companyId') companyId: string,
    @Param('programId') programId: string,
    @Param('weekIndex') weekIndex: string,
    @GetUser() user: User,
  ) {
    this.assertCanModify(user);
    await this.service.assertStaffBelongsToCompany(user, companyId);
    const idx = Number.parseInt(weekIndex, 10);
    if (!Number.isFinite(idx) || idx < 1) {
      throw new BadRequestException('weekIndex inválido');
    }
    return this.groupPrograms.publishWeek(companyId, programId, idx, user);
  }

  @Get('company/:companyId/group-programs/:programId/overview')
  async groupProgramOverview(
    @Param('companyId') companyId: string,
    @Param('programId') programId: string,
    @GetUser() user: User,
  ) {
    await this.service.assertStaffBelongsToCompany(user, companyId);
    return this.groupPrograms.getOverview(companyId, programId);
  }

  @Get('company/:companyId/athletes/:athleteId/group-programs')
  async listAthleteGroupPrograms(
    @Param('companyId') companyId: string,
    @Param('athleteId') athleteId: string,
    @GetUser() user: User,
  ) {
    await this.service.assertStaffBelongsToCompany(user, companyId);
    await this.service.assertCanAccessTrainingAthlete(user, athleteId, false);
    return this.groupPrograms.listAthleteGroupPrograms(companyId, athleteId);
  }
}
