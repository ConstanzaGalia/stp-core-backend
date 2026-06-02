import { Module } from '@nestjs/common';
import { ExerciseController } from './exercise.controller';
import { ExerciseService } from './exercise.service';
import { ExerciseSeedService } from './exercise-seed.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Exercise } from 'src/entities/excercise.entity';
import { Company } from 'src/entities/company.entity';
import { Category } from 'src/entities/category.entity';
import { MovementPattern } from 'src/entities/movement-pattern.entity';
import { SafetyTag } from 'src/entities/safety-tag.entity';
import { Tag } from 'src/entities/tag.entity';
import { Pagination } from 'src/common/pagination/pagination';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Exercise,
      Company,
      Category,
      MovementPattern,
      SafetyTag,
      Tag,
    ]),
  ],
  controllers: [ExerciseController],
  providers: [ExerciseService, ExerciseSeedService, Pagination],
  exports: [ExerciseService],
})
export class ExerciseModule {}
