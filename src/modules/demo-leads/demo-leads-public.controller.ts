import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { SkipCompanySubscriptionCheck } from 'src/common/decorators/skip-company-subscription-check.decorator';
import { DemoLeadsService, DemoRequestContext } from './demo-leads.service';
import { CreateDemoLeadDto, TrackDemoEventDto } from './dto/demo-leads.dto';

function requestContext(req: Request): DemoRequestContext {
  const userAgent = req.headers['user-agent'];
  return {
    // Con `trust proxy` (TRUST_PROXY_HOPS / Railway) es la IP real del visitante.
    ip: req.ip ?? null,
    userAgent: typeof userAgent === 'string' ? userAgent.slice(0, 500) : null,
  };
}

/** Endpoints públicos de la demo: sin login. Solo escriben el lead y sus eventos. */
@Controller('public/demo')
@SkipCompanySubscriptionCheck()
export class DemoLeadsPublicController {
  constructor(private readonly demoLeadsService: DemoLeadsService) {}

  @Post('leads')
  @HttpCode(HttpStatus.CREATED)
  createLead(@Body() dto: CreateDemoLeadDto, @Req() req: Request) {
    return this.demoLeadsService.createLead(dto, requestContext(req));
  }

  @Post('events')
  @HttpCode(HttpStatus.OK)
  trackEvent(@Body() dto: TrackDemoEventDto, @Req() req: Request) {
    return this.demoLeadsService.trackEvent(dto, requestContext(req));
  }
}
