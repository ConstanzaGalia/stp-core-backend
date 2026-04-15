import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GetUser } from '../auth/get-user.decorator';
import { User } from 'src/entities/user.entity';
import { PhysicalEvaluationService } from './physical-evaluation.service';
import { CreatePhysicalEvaluationDto } from './dto/create-physical-evaluation.dto';

/**
 * API legacy: alta manual de tests con métricas JSON.
 * El flujo principal por archivos del staff usa `POST /evaluaciones` y `POST /evaluaciones/:id/upload`.
 */
@Controller('physical-evaluations')
@UseGuards(AuthGuard('jwt'))
export class PhysicalEvaluationController {
  constructor(private readonly service: PhysicalEvaluationService) {}

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

  @Delete(':userId/:evaluationId')
  remove(@GetUser() actor: User, @Param('userId') userId: string, @Param('evaluationId') evaluationId: string) {
    return this.service.remove(actor, userId, evaluationId);
  }
}
