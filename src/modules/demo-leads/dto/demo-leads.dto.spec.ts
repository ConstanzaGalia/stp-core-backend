import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { CreateDemoLeadDto, TrackDemoEventDto } from './demo-leads.dto';

/** Mismas opciones que el ValidationPipe global de main.ts. */
async function validateDto<T extends object>(cls: new () => T, plain: Record<string, unknown>) {
  const instance = plainToInstance(cls, plain);
  const errors = await validate(instance, { whitelist: true, forbidNonWhitelisted: true });
  return { instance, errors };
}

function messagesFor(errors: ValidationError[], property: string): string[] {
  const error = errors.find((e) => e.property === property);
  return error ? Object.values(error.constraints ?? {}) : [];
}

const validLead = {
  email: '  Coach@Ejemplo.COM ',
  phone: '011 15 2345-6789',
  consent: true,
  consentTextVersion: 'v1',
};

describe('CreateDemoLeadDto', () => {
  it('acepta un alta mínima y normaliza el email', async () => {
    const { instance, errors } = await validateDto(CreateDemoLeadDto, validLead);
    expect(errors).toHaveLength(0);
    expect(instance.email).toBe('coach@ejemplo.com');
  });

  it('acepta los campos opcionales y UTM', async () => {
    const { errors, instance } = await validateDto(CreateDemoLeadDto, {
      ...validLead,
      name: '  Ana ',
      gymName: 'Box Norte',
      plan: 'center',
      utmSource: 'instagram',
      utmMedium: 'paid',
      utmCampaign: 'demo-nov',
      utmContent: 'reel-1',
      utmTerm: '',
      referrer: 'https://l.instagram.com/',
      pageUrl: 'https://entrenamientostp.com/demo?plan=center',
      eventId: 'abc123DEF456',
      fbp: 'fb.1.1700000000.123',
      website: '',
    });
    expect(errors).toHaveLength(0);
    expect(instance.name).toBe('Ana');
    expect(instance.utmTerm).toBeUndefined();
  });

  it('exige email válido con mensaje claro', async () => {
    const { errors } = await validateDto(CreateDemoLeadDto, { ...validLead, email: 'no-es-email' });
    expect(messagesFor(errors, 'email')).toContain('El email no es válido.');
  });

  it('exige email', async () => {
    const { errors } = await validateDto(CreateDemoLeadDto, { ...validLead, email: '' });
    expect(messagesFor(errors, 'email')).toContain('Ingresá tu email.');
  });

  it('exige teléfono interpretable', async () => {
    const { errors } = await validateDto(CreateDemoLeadDto, { ...validLead, phone: '1234' });
    expect(messagesFor(errors, 'phone')[0]).toMatch(/teléfono no es válido/);
  });

  it('exige teléfono', async () => {
    const { errors } = await validateDto(CreateDemoLeadDto, { ...validLead, phone: '   ' });
    expect(messagesFor(errors, 'phone')).toContain('Ingresá tu teléfono.');
  });

  it.each([[false], [undefined], ['true']])('rechaza consentimiento %p', async (consent) => {
    const { errors } = await validateDto(CreateDemoLeadDto, { ...validLead, consent });
    expect(messagesFor(errors, 'consent')).toContain('Necesitamos tu consentimiento para contactarte.');
  });

  it('rechaza campos desconocidos', async () => {
    const { errors } = await validateDto(CreateDemoLeadDto, { ...validLead, role: 'STP_ADMIN' });
    expect(errors.some((e) => e.property === 'role')).toBe(true);
  });

  it('rechaza eventId con formato inválido', async () => {
    const { errors } = await validateDto(CreateDemoLeadDto, { ...validLead, eventId: 'x y' });
    expect(errors.some((e) => e.property === 'eventId')).toBe(true);
  });
});

describe('TrackDemoEventDto', () => {
  it('exige paso en demo_step_viewed', async () => {
    const { errors } = await validateDto(TrackDemoEventDto, { token: 't', type: 'demo_step_viewed' });
    expect(errors.some((e) => e.property === 'step')).toBe(true);
  });

  it('exige plan válido en start_clicked', async () => {
    const missing = await validateDto(TrackDemoEventDto, { token: 't', type: 'start_clicked' });
    expect(missing.errors.some((e) => e.property === 'plan')).toBe(true);

    const club = await validateDto(TrackDemoEventDto, { token: 't', type: 'start_clicked', plan: 'club' });
    expect(club.errors.some((e) => e.property === 'plan')).toBe(true);

    const ok = await validateDto(TrackDemoEventDto, { token: 't', type: 'start_clicked', plan: 'personal' });
    expect(ok.errors).toHaveLength(0);
  });

  it('no deja reportar lead_captured desde el navegador', async () => {
    const { errors } = await validateDto(TrackDemoEventDto, { token: 't', type: 'lead_captured' });
    expect(errors.some((e) => e.property === 'type')).toBe(true);
  });

  it('acepta demo_completed sin paso', async () => {
    const { errors } = await validateDto(TrackDemoEventDto, { token: 't', type: 'demo_completed' });
    expect(errors).toHaveLength(0);
  });
});
