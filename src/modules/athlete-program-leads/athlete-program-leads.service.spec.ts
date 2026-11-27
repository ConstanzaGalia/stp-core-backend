import { ForbiddenException, HttpException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { UserRole } from 'src/common/enums/enums';
import { AthleteProgramLead } from 'src/entities/athlete-program-lead.entity';
import { AthleteProgramLeadsService } from './athlete-program-leads.service';
import {
  AthleteProgramLeadStatus,
  AthleteProgramModality,
} from './athlete-program-leads.constants';
import { CreateAthleteProgramLeadDto } from './dto/athlete-program-leads.dto';

function uniqueViolation(): QueryFailedError {
  const error = new QueryFailedError('INSERT', [], new Error('duplicate'));
  (error as unknown as { driverError: { code: string } }).driverError = { code: '23505' };
  return error;
}

function buildDto(overrides: Partial<CreateAthleteProgramLeadDto> = {}): CreateAthleteProgramLeadDto {
  return Object.assign(new CreateAthleteProgramLeadDto(), {
    email: 'ana@ejemplo.com',
    phone: '381 555 1234',
    name: 'Ana Pérez',
    modality: AthleteProgramModality.PRESENCIAL,
    consent: true,
    consentTextVersion: '2026-11-atleta',
    ...overrides,
  });
}

function setup() {
  const leads: AthleteProgramLead[] = [];
  let attempts = 0;
  let idSeq = 0;

  const leadRepo = {
    findOne: jest.fn(async ({ where }: { where: Partial<AthleteProgramLead> }) => {
      const found = leads.find((lead) => (where.id ? lead.id === where.id : lead.email === where.email));
      return found ? Object.assign(new AthleteProgramLead(), found) : null;
    }),
    create: jest.fn((data: Partial<AthleteProgramLead>) => Object.assign(new AthleteProgramLead(), data)),
    save: jest.fn(async (lead: AthleteProgramLead) => {
      if (!lead.id) {
        if (leads.some((row) => row.email === lead.email)) throw uniqueViolation();
        lead.id = `lead-${++idSeq}`;
        lead.createdAt = new Date();
        leads.push(Object.assign(new AthleteProgramLead(), lead));
      } else {
        const index = leads.findIndex((row) => row.id === lead.id);
        leads[index] = Object.assign(new AthleteProgramLead(), lead);
      }
      return lead;
    }),
  };
  const attemptRepo = {
    count: jest.fn(async () => attempts),
    insert: jest.fn(async () => {
      attempts += 1;
    }),
    delete: jest.fn(),
  };
  const config = { get: jest.fn(() => undefined) };
  const mailing = { sendMail: jest.fn(async () => undefined) };
  const service = new AthleteProgramLeadsService(
    leadRepo as never,
    attemptRepo as never,
    config as never,
    mailing as never,
  );
  return { service, leads };
}

describe('AthleteProgramLeadsService', () => {
  it('guarda el interesado con teléfono normalizado y estado nuevo', async () => {
    const { service, leads } = setup();
    await service.createLead(buildDto({ programInterest: '3 veces por semana' }), { ip: '1.2.3.4' });
    expect(leads).toHaveLength(1);
    expect(leads[0].phoneE164).toBe('+5493815551234');
    expect(leads[0].modality).toBe(AthleteProgramModality.PRESENCIAL);
    expect(leads[0].status).toBe(AthleteProgramLeadStatus.NEW);
    expect(leads[0].programInterest).toBe('3 veces por semana');
  });

  it('no guarda nada si el campo trampa viene lleno', async () => {
    const { service, leads } = setup();
    await service.createLead(buildDto({ website: 'http://spam.test' }), { ip: '1.2.3.4' });
    expect(leads).toHaveLength(0);
  });

  it('un reenvío actualiza la modalidad y no retrocede el estado', async () => {
    const { service, leads } = setup();
    await service.createLead(buildDto(), { ip: '1.2.3.4' });
    leads[0].status = AthleteProgramLeadStatus.CONTACTED;
    await service.createLead(
      buildDto({ modality: AthleteProgramModality.ONLINE, name: 'Ana' }),
      { ip: '1.2.3.4' },
    );
    expect(leads).toHaveLength(1);
    expect(leads[0].modality).toBe(AthleteProgramModality.ONLINE);
    expect(leads[0].status).toBe(AthleteProgramLeadStatus.CONTACTED);
    expect(leads[0].name).toBe('Ana');
  });

  it('ventas puede actualizar el estado', async () => {
    const { service, leads } = setup();
    await service.createLead(buildDto(), { ip: '1.2.3.4' });
    const view = await service.updateStatus(
      { role: UserRole.STP_SALES } as never,
      leads[0].id,
      AthleteProgramLeadStatus.CONTACTED,
    );
    expect(view.status).toBe(AthleteProgramLeadStatus.CONTACTED);
  });

  it('rechaza el listado si no es del equipo comercial', async () => {
    const { service } = setup();
    await expect(
      service.listLeads({ role: UserRole.DIRECTOR } as never, {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rechaza un teléfono inválido', async () => {
    const { service } = setup();
    await expect(service.createLead(buildDto({ phone: '123' }), { ip: '1.2.3.4' })).rejects.toBeInstanceOf(
      HttpException,
    );
  });
});
