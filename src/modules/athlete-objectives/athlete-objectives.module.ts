import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AthleteObjective } from 'src/entities/athlete-objective.entity';
import { User } from 'src/entities/user.entity';
import { AthleteObjectivesController } from './athlete-objectives.controller';
import { AthleteObjectivesService } from './athlete-objectives.service';

@Module({
  imports: [TypeOrmModule.forFeature([AthleteObjective, User])],
  controllers: [AthleteObjectivesController],
  providers: [AthleteObjectivesService],
  exports: [AthleteObjectivesService],
})
export class AthleteObjectivesModule {}
