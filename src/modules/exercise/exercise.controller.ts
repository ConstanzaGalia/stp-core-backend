import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Param,
  Delete,
  Query,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GetUser } from '../auth/get-user.decorator';
import { User } from '../../entities/user.entity';
import { ExerciseService } from './exercise.service';
import { CreateExerciseDto } from './dto/create-exercise.dto';
import { UpdateExerciseDto } from './dto/update-exercise.dto';
import { PaginatedListDto } from 'src/common/pagination/DTOs/paginated-list.dto';
import { ExerciseListQueryDto } from './dto/exercise-list-query.dto';

function requireCompanyId(companyId?: string): string {
  if (!companyId?.trim()) {
    throw new BadRequestException('companyId es requerido');
  }
  return companyId.trim();
}

@Controller('exercises')
@UseGuards(AuthGuard('jwt'))
export class ExerciseController {
  constructor(private readonly exerciseService: ExerciseService) {}

  @Post()
  create(
    @GetUser() user: User,
    @Query('companyId') companyId: string,
    @Body() createExerciseDto: CreateExerciseDto,
  ) {
    return this.exerciseService.create(
      user,
      requireCompanyId(companyId),
      createExerciseDto,
    );
  }

  @Get('movement-patterns')
  findAllMovementPatterns() {
    return this.exerciseService.findAllMovementPatterns();
  }

  @Get('safety-tags')
  findAllSafetyTags() {
    return this.exerciseService.findAllSafetyTags();
  }

  @Get('categories')
  findAllCategories() {
    return this.exerciseService.findAllCategories();
  }

  @Get('filter')
  filter(
    @GetUser() user: User,
    @Query('companyId') companyId: string,
    @Query('maxScore') maxScore?: string,
    @Query('excludeTagKeys') excludeTagKeys?: string,
    @Query('patternId') patternId?: string,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.exerciseService.filter(user, requireCompanyId(companyId), {
      maxScore: maxScore ? Number(maxScore) : undefined,
      excludeTagKeys: excludeTagKeys ? excludeTagKeys.split(',') : undefined,
      patternId: patternId ? Number(patternId) : undefined,
      categoryId: categoryId ? Number(categoryId) : undefined,
    });
  }

  @Get()
  findAll(
    @GetUser() user: User,
    @Query() query: ExerciseListQueryDto,
    @Req() request,
  ): Promise<PaginatedListDto<any>> {
    return this.exerciseService.findAll(
      user,
      requireCompanyId(query.companyId),
      query.offset || 0,
      query.limit || 15,
      request.url,
    );
  }

  @Get(':id')
  findOne(
    @GetUser() user: User,
    @Query('companyId') companyId: string,
    @Param('id') id: string,
  ) {
    return this.exerciseService.findOne(user, requireCompanyId(companyId), id);
  }

  @Put(':id')
  update(
    @GetUser() user: User,
    @Query('companyId') companyId: string,
    @Param('id') id: string,
    @Body() updateExerciseDto: UpdateExerciseDto,
  ) {
    return this.exerciseService.update(
      user,
      requireCompanyId(companyId),
      id,
      updateExerciseDto,
    );
  }

  @Delete(':id')
  remove(
    @GetUser() user: User,
    @Query('companyId') companyId: string,
    @Param('id') id: string,
  ) {
    return this.exerciseService.remove(user, requireCompanyId(companyId), id);
  }
}
