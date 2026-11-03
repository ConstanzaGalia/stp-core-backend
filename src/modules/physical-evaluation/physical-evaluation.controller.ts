import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GetUser } from '../auth/get-user.decorator';
import { User } from 'src/entities/user.entity';
import { PhysicalEvaluationService } from './physical-evaluation.service';
import { CreatePhysicalEvaluationDto } from './dto/create-physical-evaluation.dto';
import { UpdateEvaluationCriteriaDto } from './dto/update-evaluation-criteria.dto';
import { SetRepetitionDecisionDto } from './dto/set-repetition-decision.dto';

/**
 * API legacy: alta manual de tests con métricas JSON.
 * El flujo principal por archivos del staff usa `POST /evaluaciones` y `POST /evaluaciones/:id/upload`.
 */
@Controller('physical-evaluations')
@UseGuards(AuthGuard('jwt'))
export class PhysicalEvaluationController {
  constructor(private readonly service: PhysicalEvaluationService) {}

  /** Hub staff: evaluaciones físicas + participantes externos (aunque no tengan tests aún). */
  @Get('hub/company/:companyId/athletes')
  listHub(@GetUser() actor: User, @Param('companyId') companyId: string) {
    return this.service.listHubAthletesWithPhysicalEvaluations(actor, companyId);
  }

  @Post(':userId')
  create(@GetUser() actor: User, @Param('userId') userId: string, @Body() dto: CreatePhysicalEvaluationDto) {
    return this.service.create(actor, userId, dto);
  }

  @Get(':userId')
  list(
    @GetUser() actor: User,
    @Param('userId') userId: string,
    @Query('excludeStpLegacyOnly') excludeStpLegacyOnly?: string,
  ) {
    const exclude =
      excludeStpLegacyOnly === '1' || excludeStpLegacyOnly?.toLowerCase() === 'true';
    return this.service.listForAthlete(actor, userId, { excludeStpLegacyOnly: exclude });
  }

  @Get(':userId/:evaluationId')
  getOne(@GetUser() actor: User, @Param('userId') userId: string, @Param('evaluationId') evaluationId: string) {
    return this.service.findOneById(actor, userId, evaluationId);
  }

  @Patch(':userId/:evaluationId/criteria-set')
  updateCriteriaSet(
    @GetUser() actor: User,
    @Param('userId') userId: string,
    @Param('evaluationId') evaluationId: string,
    @Body() dto: UpdateEvaluationCriteriaDto,
  ) {
    return this.service.updateCriteriaSetId(actor, userId, evaluationId, dto.criteriaSetId ?? null);
  }

  /** El entrenador incluye, excluye o devuelve a la regla automática una repetición; responde el test recalculado. */
  @Patch(':userId/:evaluationId/tests/:testId/repetitions/:index')
  setRepetitionDecision(
    @GetUser() actor: User,
    @Param('userId') userId: string,
    @Param('evaluationId') evaluationId: string,
    @Param('testId') testId: string,
    @Param('index', ParseIntPipe) index: number,
    @Body() dto: SetRepetitionDecisionDto,
  ) {
    return this.service.setRepetitionDecision(actor, userId, evaluationId, testId, index, dto);
  }

  @Delete(':userId/:evaluationId')
  remove(@GetUser() actor: User, @Param('userId') userId: string, @Param('evaluationId') evaluationId: string) {
    return this.service.remove(actor, userId, evaluationId);
  }
}
