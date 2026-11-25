import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GetUser } from '../auth/get-user.decorator';
import { User } from 'src/entities/user.entity';
import { BiomechanicalScreeningService } from './biomechanical-screening.service';
import {
  CompleteScreeningSessionDto,
  CreateScreeningSessionDto,
  CreateScreeningSnapshotDto,
  CreateScreeningVideoDto,
  SaveScreeningTestDto,
  UpdateScreeningNotesDto,
  UpdateScreeningSnapshotDto,
  UpdateScreeningVideoDto,
} from './dto/screening.dto';

@Controller('biomechanical-screenings')
@UseGuards(AuthGuard('jwt'))
export class BiomechanicalScreeningController {
  constructor(private readonly service: BiomechanicalScreeningService) {}

  @Get('protocol')
  getProtocol() {
    return this.service.getProtocolDefinition();
  }

  @Get(':userId')
  list(@GetUser() actor: User, @Param('userId') userId: string) {
    return this.service.listForAthlete(actor, userId);
  }

  @Post(':userId')
  create(
    @GetUser() actor: User,
    @Param('userId') userId: string,
    @Body() dto: CreateScreeningSessionDto,
  ) {
    return this.service.createSession(actor, userId, dto);
  }

  @Get(':userId/:sessionId')
  getOne(
    @GetUser() actor: User,
    @Param('userId') userId: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.service.getSession(actor, userId, sessionId);
  }

  @Patch(':userId/:sessionId')
  updateProgress(
    @GetUser() actor: User,
    @Param('userId') userId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: UpdateScreeningNotesDto,
  ) {
    return this.service.updateProgress(actor, userId, sessionId, dto);
  }

  @Post(':userId/:sessionId/complete')
  complete(
    @GetUser() actor: User,
    @Param('userId') userId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: CompleteScreeningSessionDto,
  ) {
    return this.service.completeSession(actor, userId, sessionId, dto.notes);
  }

  @Patch(':userId/:sessionId/tests/:testCode')
  saveTest(
    @GetUser() actor: User,
    @Param('userId') userId: string,
    @Param('sessionId') sessionId: string,
    @Param('testCode') testCode: string,
    @Body() dto: SaveScreeningTestDto,
  ) {
    return this.service.saveTest(actor, userId, sessionId, testCode, dto);
  }

  @Post(':userId/:sessionId/tests/:testCode/snapshots')
  addSnapshot(
    @GetUser() actor: User,
    @Param('userId') userId: string,
    @Param('sessionId') sessionId: string,
    @Param('testCode') testCode: string,
    @Body() dto: CreateScreeningSnapshotDto,
  ) {
    return this.service.addSnapshot(actor, userId, sessionId, testCode, dto);
  }

  @Patch(':userId/:sessionId/snapshots/:snapshotId')
  updateSnapshot(
    @GetUser() actor: User,
    @Param('userId') userId: string,
    @Param('sessionId') sessionId: string,
    @Param('snapshotId') snapshotId: string,
    @Body() dto: UpdateScreeningSnapshotDto,
  ) {
    return this.service.updateSnapshot(actor, userId, sessionId, snapshotId, dto);
  }

  @Delete(':userId/:sessionId/snapshots/:snapshotId')
  removeSnapshot(
    @GetUser() actor: User,
    @Param('userId') userId: string,
    @Param('sessionId') sessionId: string,
    @Param('snapshotId') snapshotId: string,
  ) {
    return this.service.removeSnapshot(actor, userId, sessionId, snapshotId);
  }

  @Post(':userId/:sessionId/tests/:testCode/videos')
  addVideo(
    @GetUser() actor: User,
    @Param('userId') userId: string,
    @Param('sessionId') sessionId: string,
    @Param('testCode') testCode: string,
    @Body() dto: CreateScreeningVideoDto,
  ) {
    return this.service.addVideo(actor, userId, sessionId, testCode, dto);
  }

  @Patch(':userId/:sessionId/videos/:videoId')
  updateVideo(
    @GetUser() actor: User,
    @Param('userId') userId: string,
    @Param('sessionId') sessionId: string,
    @Param('videoId') videoId: string,
    @Body() dto: UpdateScreeningVideoDto,
  ) {
    return this.service.updateVideo(actor, userId, sessionId, videoId, dto);
  }

  @Delete(':userId/:sessionId/videos/:videoId')
  removeVideo(
    @GetUser() actor: User,
    @Param('userId') userId: string,
    @Param('sessionId') sessionId: string,
    @Param('videoId') videoId: string,
  ) {
    return this.service.removeVideo(actor, userId, sessionId, videoId);
  }

  @Delete(':userId/:sessionId')
  remove(
    @GetUser() actor: User,
    @Param('userId') userId: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.service.removeSession(actor, userId, sessionId);
  }
}
