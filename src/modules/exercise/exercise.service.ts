import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PaginatedListDto } from 'src/common/pagination/DTOs/paginated-list.dto';
import { Pagination } from 'src/common/pagination/pagination';
import { Exercise } from 'src/entities/excercise.entity';
import { Repository } from 'typeorm';
import { CreateExerciseDto } from './dto/create-exercise.dto';
import { UpdateExerciseDto } from './dto/create-exercise.dto copy';


@Injectable()
export class ExerciseService {
  constructor(
    @InjectRepository(Exercise)
    private readonly ExerciseRepository: Repository<Exercise>,
    private pagination: Pagination,
  ) {}
  public async create(createExerciseDto: CreateExerciseDto) {
    try {
      const newExercise = this.ExerciseRepository.create(createExerciseDto);
      return await this.ExerciseRepository.save(newExercise);
    } catch (error) {
      Logger.log(`Error to create exercise`, error);
    }
  }

  public async findAll(
    offset: number,
    limit: number,
    path: string,
  ): Promise<PaginatedListDto<Exercise>> {
    const [companies, count] = await this.ExerciseRepository.findAndCount({
      take: limit,
      skip: offset,
      order: {
        name: 'ASC',
      },
    });
    return new PaginatedListDto(
      companies,
      this.pagination.buildPaginationDto(limit, offset, count, path),
    );
  }

  public async findOne(id: string): Promise<Exercise> {
    return await this.ExerciseRepository.findOneBy({ id });
  }

  public async update(id: string, updateExerciseDto: UpdateExerciseDto) {
    try {
      return await this.ExerciseRepository.update(id, updateExerciseDto);
    } catch (error) {
      Logger.log(`Error to update Exercise ${id}`, error);
    }
  }

  public async remove(id: string): Promise<string> {
    try {
      await this.ExerciseRepository.softDelete(id);
      return `The Exercise ${id} was deleted`;
    } catch (error) {
      Logger.log(`Error to delete Exercise ${id}`, error);
    }
  }
}
