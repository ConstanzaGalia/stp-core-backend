import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GetUser } from '../auth/get-user.decorator';
import { User } from 'src/entities/user.entity';
import { EvaluationCriteriaSetService } from './evaluation-criteria-set.service';
import {
  CreateEvaluationCriteriaSetDto,
  UpdateEvaluationCriteriaSetDto,
} from './dto/evaluation-criteria-set.dto';

@Controller('evaluation-criteria-sets')
@UseGuards(AuthGuard('jwt'))
export class EvaluationCriteriaSetController {
  constructor(private readonly criteria: EvaluationCriteriaSetService) {}

  @Get()
  list(@Query('testType') testType?: string, @Query('active') active?: string) {
    const activeOnly = active == null || active === '1' || active.toLowerCase() === 'true';
    return this.criteria.list(testType?.trim() || undefined, activeOnly);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.criteria.findById(id);
  }

  @Post()
  create(@GetUser() actor: User, @Body() dto: CreateEvaluationCriteriaSetDto) {
    return this.criteria.create(actor, dto);
  }

  @Put(':id')
  update(
    @GetUser() actor: User,
    @Param('id') id: string,
    @Body() dto: UpdateEvaluationCriteriaSetDto,
  ) {
    return this.criteria.update(actor, id, dto);
  }

  @Delete(':id')
  remove(@GetUser() actor: User, @Param('id') id: string) {
    return this.criteria.remove(actor, id);
  }
}
