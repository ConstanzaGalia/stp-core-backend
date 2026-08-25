import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Competition } from '../../entities/competition.entity';
import { CompetitionDivision } from '../../entities/competition-division.entity';
import { CompetitionParticipant } from '../../entities/competition-participant.entity';
import { CompetitionParticipantMatch } from '../../entities/competition-participant-match.entity';
import { CompetitionMatch } from '../../entities/competition-match.entity';
import { AthleteObjective } from '../../entities/athlete-objective.entity';
import { Company } from '../../entities/company.entity';
import { Division } from '../../entities/division.entity';
import { AthleteInvitation } from '../../entities/athlete-invitation.entity';
import { AuthModule } from '../auth/auth.module';
import { CompetitionsController } from './competitions.controller';
import { CompetitionsService } from './competitions.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Competition,
      CompetitionDivision,
      CompetitionParticipant,
      CompetitionParticipantMatch,
      CompetitionMatch,
      AthleteObjective,
      Company,
      Division,
      AthleteInvitation,
    ]),
    AuthModule,
  ],
  controllers: [CompetitionsController],
  providers: [CompetitionsService],
  exports: [CompetitionsService],
})
export class CompetitionsModule {}
