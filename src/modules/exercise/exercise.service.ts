import { Injectable, Inject } from '@nestjs/common';
import { Exercise } from 'src/entities/excercise.entity';
import { BaseRepository } from 'src/repositories/base.repository';
import { DeepPartial, FindManyOptions, FindOneOptions } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';


@Injectable()
export class ExerciseService {
  constructor(
    @Inject('ExerciseBaseRepository')
    private readonly exerciseRepository: BaseRepository<Exercise>,
  ) {}

  create(createExerciseDto: DeepPartial<Exercise>): Promise<Exercise> {
    return this.exerciseRepository.create(createExerciseDto);
  }

  findAll(options?: FindManyOptions<Exercise>): Promise<Exercise[]> {
    return this.exerciseRepository.findAll(options);
  }

  findOne(options?: FindOneOptions<Exercise>): Promise<Exercise> {
    return this.exerciseRepository.findOne(options);
  }

  update(id: string, updateExerciseDto: QueryDeepPartialEntity<Exercise>): Promise<void> {
    return this.exerciseRepository.update(id, updateExerciseDto);
  }

  remove(id: string): Promise<void> {
    return this.exerciseRepository.remove(id);
  }
}
