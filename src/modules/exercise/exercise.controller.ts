import { Controller, Get, Post, Body, Put, Param, Delete, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ExerciseService } from './exercise.service';
import { CreateExerciseDto } from './dto/create-exercise.dto';
import { UpdateExerciseDto } from './dto/create-exercise.dto copy';
import { PaginationQueryDto } from 'src/common/pagination/DTOs/pagination-query.dto';
import { PaginatedListDto } from 'src/common/pagination/DTOs/paginated-list.dto';

@Controller('exercises')
@UseGuards(AuthGuard('jwt'))
export class ExerciseController {
  constructor(private readonly exerciseService: ExerciseService) {}

  @Post()
  create(@Body() createExerciseDto: CreateExerciseDto) {
    return this.exerciseService.create(createExerciseDto);
  }

  @Get()
  findAll(
    @Query() pagination: PaginationQueryDto,
    @Req() request,
  ): Promise<PaginatedListDto<any>> {
    return this.exerciseService.findAll(
      pagination.offset || 0,
      pagination.limit || 15,
      request.url,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.exerciseService.findOne(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() updateExerciseDto: UpdateExerciseDto) {
    return this.exerciseService.update(id, updateExerciseDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.exerciseService.remove(id);
  }
}
