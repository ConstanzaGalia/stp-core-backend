import { HttpStatus, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { DemoLead } from 'src/entities/demo-lead.entity';
import { UserRole } from 'src/common/enums/enums';
import { DemoLeadsService } from './demo-leads.service';
import {
  advanceDemoLeadStatus,
  DEMO_LEAD_RATE_LIMIT,
  DemoLeadEventType,
  DemoLeadPlan,
  DemoLeadStatus,
} from './demo-leads.constants';
import { CreateDemoLeadDto, TrackDemoEventDto } from './dto/demo-leads.dto';
import { verifyDemoLeadToken } from './demo-token.util';

const SECRET = 'test-secret';
const CTX = { ip: '200.1.2.3', userAgent: 'jest' };

function uniqueViolation(): QueryFailedError {
  const error = new QueryFailedError('INSERT', [], new Error('duplicate'));
  (error as unknown as { driverError: { code: string } }).driverError = { code: '23505' };
  return error;
}

function buildDto(overrides: Partial<CreateDemoLeadDto> = {}): CreateDemoLeadDto {
  return Object.assign(new CreateDemoLeadDto(), {
    email: 'coach@ejemplo.com',
    phone: '11 2345 6789',
    consent: true,
    consentTextVersion: 'v1',
    ...overrides,
  });
}

/** Repos en memoria, suficientes para el servicio. */
function setup(env: Record<string, string> = {}) {
  const leads: DemoLead[] = [];
  const eventIds = new Set<string>();
  const events: Array<{ leadId: string; eventType: string; step: string | null; eventId: string }> = [];
  let attempts = 0;
  let idSeq = 0;

  const leadRepo = {
    findOne: jest.fn(async ({ where }: { where: Partial<DemoLead> }) => {
      const found = leads.find((l) =>
        where.id ? l.id === where.id : l.email === where.email,
      );
      return found ? Object.assign(new DemoLead(), found) : null;
    }),
    create: jest.fn((data: Partial<DemoLead>) => Object.assign(new DemoLead(), data)),
    save: jest.fn(async (lead: DemoLead) => {
      if (!lead.id) {
        if (leads.some((l) => l.email === lead.email)) throw uniqueViolation();
        lead.id = `lead-${++idSeq}`;
        lead.createdAt = new Date();
        leads.push(Object.assign(new DemoLead(), lead));
      } else {
        const index = leads.findIndex((l) => l.id === lead.id);
        leads[index] = Object.assign(new DemoLead(), lead);
      }
      return lead;
    }),
  };
  const eventRepo = {
    insert: jest.fn(async (row: { lead: { id: string }; eventType: string; step: string | null; eventId: string }) => {
      if (eventIds.has(row.eventId)) throw uniqueViolation();
      eventIds.add(row.eventId);
      events.push({ leadId: row.lead.id, eventType: row.eventType, step: row.step, eventId: row.eventId });
    }),
    count: jest.fn(async () => events.length),
  };
  const attemptRepo = {
    count: jest.fn(async () => attempts),
    insert: jest.fn(async () => {
      attempts += 1;
    }),
    delete: jest.fn(),
  };
  const config = {
    get: jest.fn((key: string) => ({ SECRET_JWT: SECRET, RESEND_FROM_EMAIL: 'no-reply@stp.test', ...env })[key]),
  };
  const mailing = { sendMail: jest.fn(async () => undefined) };
  const metaCapi = { sendEvent: jest.fn(async () => undefined) };

  const service = new DemoLeadsService(
    leadRepo as never,
    eventRepo as never,
    attemptRepo as never,
    config as never,
    mailing as never,
    metaCapi as never,
  );

  return { service, leads, events, leadRepo, attemptRepo, mailing, metaCapi };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('DemoLeadsService.createLead', () => {
  it('crea el lead con teléfono normalizado, estado nuevo y origen', async () => {
    const { service, leads, events } = setup();
    const { token } = await service.createLead(
      buildDto({ utmSource: 'instagram', utmCampaign: 'demo', plan: 'center', pageUrl: 'https://x/demo' }),
      CTX,
    );

    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({
      email: 'coach@ejemplo.com',
      phoneE164: '+5491123456789',
      phoneRaw: '11 2345 6789',
      status: DemoLeadStatus.NEW,
      planInterest: DemoLeadPlan.CENTER,
      utmSource: 'instagram',
      utmCampaign: 'demo',
      landingUrl: 'https://x/demo',
      consentContact: true,
      consentTextVersion: 'v1',
    });
    expect(leads[0].consentAt).toBeInstanceOf(Date);
    expect(verifyDemoLeadToken(token, SECRET)).toBe(leads[0].id);
    expect(events).toEqual([
      expect.objectContaining({ leadId: leads[0].id, eventType: DemoLeadEventType.LEAD_CAPTURED }),
    ]);
  });

  it('si el email ya existe actualiza en vez de duplicar, sin tocar estado ni UTM de origen', async () => {
    const { service, leads } = setup();
    await service.createLead(buildDto({ utmSource: 'instagram', name: 'Ana' }), CTX);
    leads[0].status = DemoLeadStatus.CUSTOMER;

    await service.createLead(
      buildDto({ phone: '+54 9 351 123 4567', utmSource: 'google', gymName: 'Box Norte' }),
      CTX,
    );

    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({
      phoneE164: '+5493511234567',
      name: 'Ana',
      gymName: 'Box Norte',
      utmSource: 'instagram',
      status: DemoLeadStatus.CUSTOMER,
    });
  });

  it('resuelve dos altas simultáneas del mismo email actualizando la existente', async () => {
    const { service, leads, leadRepo } = setup();
    await service.createLead(buildDto(), CTX);
    // Simula la carrera: la búsqueda inicial no lo ve, el INSERT choca con el único.
    leadRepo.findOne.mockResolvedValueOnce(null);

    await service.createLead(buildDto({ name: 'Segundo envío' }), CTX);

    expect(leads).toHaveLength(1);
    expect(leads[0].name).toBe('Segundo envío');
  });

  it('avisa por email solo cuando el lead es nuevo, con link de WhatsApp', async () => {
    const { service, mailing } = setup({ DEMO_LEADS_NOTIFY_EMAIL: 'ventas@stp.test, otra@stp.test' });
    await service.createLead(buildDto({ name: 'Ana' }), CTX);
    await flush();
    expect(mailing.sendMail).toHaveBeenCalledTimes(2);
    const mail = (mailing.sendMail.mock.calls[0] as unknown[])[0] as { to: string; html: string; subject: string };
    expect(mail.to).toBe('ventas@stp.test');
    expect(mail.subject).toContain('Ana');
    expect(mail.html).toContain('https://wa.me/5491123456789');

    mailing.sendMail.mockClear();
    await service.createLead(buildDto(), CTX);
    await flush();
    expect(mailing.sendMail).not.toHaveBeenCalled();
  });

  it('un fallo del email no rompe el alta', async () => {
    const { service, mailing, leads } = setup({ DEMO_LEADS_NOTIFY_EMAIL: 'ventas@stp.test' });
    mailing.sendMail.mockRejectedValueOnce(new Error('resend caído'));
    await expect(service.createLead(buildDto(), CTX)).resolves.toHaveProperty('token');
    await flush();
    expect(leads).toHaveLength(1);
  });

  it('manda el evento Lead a Meta con el mismo eventId del navegador', async () => {
    const { service, metaCapi } = setup();
    await service.createLead(buildDto({ eventId: 'evt_browser_123', fbp: 'fb.1.2.3' }), CTX);
    expect(metaCapi.sendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'Lead',
        eventId: 'evt_browser_123',
        email: 'coach@ejemplo.com',
        phoneE164: '+5491123456789',
        clientIp: CTX.ip,
        fbp: 'fb.1.2.3',
      }),
    );
  });

  it('campo trampa: responde como si nada pero no guarda ni avisa', async () => {
    const { service, leads, mailing, metaCapi } = setup({ DEMO_LEADS_NOTIFY_EMAIL: 'ventas@stp.test' });
    const result = await service.createLead(buildDto({ website: 'http://spam' }), CTX);
    await flush();
    expect(result.token).toEqual(expect.any(String));
    expect(leads).toHaveLength(0);
    expect(mailing.sendMail).not.toHaveBeenCalled();
    expect(metaCapi.sendEvent).not.toHaveBeenCalled();
  });

  it('corta con 429 al superar el límite por IP', async () => {
    const { service, leads } = setup();
    for (let i = 0; i < DEMO_LEAD_RATE_LIMIT.max; i++) {
      await service.createLead(buildDto({ email: `coach${i}@ejemplo.com` }), CTX);
    }
    await expect(service.createLead(buildDto({ email: 'otro@ejemplo.com' }), CTX)).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
    expect(leads).toHaveLength(DEMO_LEAD_RATE_LIMIT.max);
  });
});

describe('DemoLeadsService.trackEvent', () => {
  async function withLead(env: Record<string, string> = {}) {
    const ctx = setup(env);
    const { token } = await ctx.service.createLead(buildDto(), CTX);
    return { ...ctx, token };
  }

  const event = (data: Partial<TrackDemoEventDto>) => Object.assign(new TrackDemoEventDto(), data);

  it('rechaza tokens inválidos con un mensaje claro', async () => {
    const { service } = await withLead();
    await expect(
      service.trackEvent(event({ token: 'basura', type: DemoLeadEventType.DEMO_COMPLETED }), CTX),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('el token del campo trampa no sirve para registrar eventos', async () => {
    const { service } = setup();
    const { token } = await service.createLead(buildDto({ website: 'spam' }), CTX);
    await expect(
      service.trackEvent(event({ token, type: DemoLeadEventType.DEMO_COMPLETED }), CTX),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('paso visto → vio la demo; "Quiero empezar" → quiere empezar con plan', async () => {
    const { service, leads, token } = await withLead();

    await service.trackEvent(event({ token, type: DemoLeadEventType.DEMO_STEP_VIEWED, step: 'branding' }), CTX);
    expect(leads[0].status).toBe(DemoLeadStatus.DEMO_VIEWED);

    await service.trackEvent(event({ token, type: DemoLeadEventType.START_CLICKED, plan: DemoLeadPlan.PERSONAL }), CTX);
    expect(leads[0]).toMatchObject({ status: DemoLeadStatus.WANTS_TO_START, selectedPlan: DemoLeadPlan.PERSONAL });
    expect(leads[0].wantsToStartAt).toBeInstanceOf(Date);
  });

  it('demo completada manda DemoCompleted a Meta y no se cuenta doble con el mismo eventId', async () => {
    const { service, leads, metaCapi, events, token } = await withLead();
    metaCapi.sendEvent.mockClear();

    const payload = event({ token, type: DemoLeadEventType.DEMO_COMPLETED, eventId: 'evt_done_1' });
    await service.trackEvent(payload, CTX);
    await service.trackEvent(payload, CTX);

    expect(events.filter((e) => e.eventType === DemoLeadEventType.DEMO_COMPLETED)).toHaveLength(1);
    expect(metaCapi.sendEvent).toHaveBeenCalledTimes(1);
    expect(metaCapi.sendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: 'DemoCompleted', eventId: 'evt_done_1' }),
    );
    expect(leads[0].demoCompletedAt).toBeInstanceOf(Date);
  });

  it('un lead contactado no retrocede a "vio la demo"', async () => {
    const { service, leads, token } = await withLead();
    leads[0].status = DemoLeadStatus.CONTACTED;
    await service.trackEvent(event({ token, type: DemoLeadEventType.DEMO_STEP_VIEWED, step: 'library' }), CTX);
    expect(leads[0].status).toBe(DemoLeadStatus.CONTACTED);
  });
});

describe('DemoLeadsService admin', () => {
  it('solo STP_ADMIN puede listar y cambiar estados', async () => {
    const { service } = setup();
    const trainer = { role: UserRole.TRAINER } as never;
    await expect(service.listLeads(trainer, {})).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.updateStatus(trainer, 'x', DemoLeadStatus.CONTACTED)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('el admin puede mover el estado a mano en cualquier dirección', async () => {
    const { service, leads } = setup();
    await service.createLead(buildDto(), CTX);
    leads[0].status = DemoLeadStatus.WANTS_TO_START;
    const admin = { role: UserRole.STP_ADMIN } as never;
    const view = await service.updateStatus(admin, leads[0].id, DemoLeadStatus.CONTACTED);
    expect(view.status).toBe(DemoLeadStatus.CONTACTED);
    expect(view.whatsappUrl).toBe('https://wa.me/5491123456789');
  });
});

describe('advanceDemoLeadStatus', () => {
  it.each([
    [DemoLeadStatus.NEW, DemoLeadStatus.DEMO_VIEWED, DemoLeadStatus.DEMO_VIEWED],
    [DemoLeadStatus.DEMO_VIEWED, DemoLeadStatus.WANTS_TO_START, DemoLeadStatus.WANTS_TO_START],
    [DemoLeadStatus.CONTACTED, DemoLeadStatus.DEMO_VIEWED, DemoLeadStatus.CONTACTED],
    [DemoLeadStatus.CONTACTED, DemoLeadStatus.WANTS_TO_START, DemoLeadStatus.WANTS_TO_START],
    [DemoLeadStatus.CUSTOMER, DemoLeadStatus.WANTS_TO_START, DemoLeadStatus.CUSTOMER],
  ])('%s + %s → %s', (current, next, expected) => {
    expect(advanceDemoLeadStatus(current, next)).toBe(expected);
  });
});
