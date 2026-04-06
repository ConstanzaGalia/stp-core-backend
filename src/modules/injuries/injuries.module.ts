import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Injury } from 'src/entities/injury.entity';
import { User } from 'src/entities/user.entity';
import { SafetyTag } from 'src/entities/safety-tag.entity';
import { InjuriesController } from './injuries.controller';
import { InjuriesService } from './injuries.service';

@Module({
  imports: [TypeOrmModule.forFeature([Injury, User, SafetyTag])],
  controllers: [InjuriesController],
  providers: [InjuriesService],
  exports: [InjuriesService],
})
export class InjuriesModule {}
