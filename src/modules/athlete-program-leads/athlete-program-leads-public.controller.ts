import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { SkipCompanySubscriptionCheck } from 'src/common/decorators/skip-company-subscription-check.decorator';
import {
  AthleteProgramLeadsService,
  AthleteProgramRequestContext,
} from './athlete-program-leads.service';
import { CreateAthleteProgramLeadDto } from './dto/athlete-program-leads.dto';

function requestContext(req: Request): AthleteProgramRequestContext {
  return { ip: req.ip ?? null };
}

/** Formulario público de /soy-atleta. Sin login. */
@Controller('public/athlete-program')
@SkipCompanySubscriptionCheck()
export class AthleteProgramLeadsPublicController {
  constructor(private readonly leadsService: AthleteProgramLeadsService) {}

  @Post('leads')
  @HttpCode(HttpStatus.CREATED)
  createLead(@Body() dto: CreateAthleteProgramLeadDto, @Req() req: Request) {
    return this.leadsService.createLead(dto, requestContext(req));
  }
}
