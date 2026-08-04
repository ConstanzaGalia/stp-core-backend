import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { EvaluationProtocolService } from './evaluation-protocol.service';

@Controller('evaluation-protocols')
@UseGuards(AuthGuard('jwt'))
export class EvaluationProtocolController {
  constructor(private readonly protocols: EvaluationProtocolService) {}

  @Get()
  list(@Query('device') device?: string, @Query('active') active?: string) {
    const activeOnly = active == null || active === '1' || active.toLowerCase() === 'true';
    return this.protocols.list(device?.trim() || undefined, activeOnly);
  }
}
