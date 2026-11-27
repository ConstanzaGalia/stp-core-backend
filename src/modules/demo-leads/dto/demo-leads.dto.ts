import { Transform } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  Validate,
} from 'class-validator';
import {
  DEMO_CLIENT_EVENT_TYPES,
  DEMO_LEAD_STATUSES,
  DemoLeadEventType,
  DemoLeadPlan,
  DemoLeadStatus,
} from '../demo-leads.constants';
import { normalizePhoneAR } from '../phone-ar.util';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Vacío → undefined, para que `@IsOptional` lo deje pasar. */
const trimOptional = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

/** Id de evento compartido con el píxel de Meta. */
const EVENT_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

@ValidatorConstraint({ name: 'isPhoneAR', async: false })
export class IsPhoneARConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && normalizePhoneAR(value) !== null;
  }

  defaultMessage(_args: ValidationArguments): string {
    return 'El teléfono no es válido. Escribilo con código de área, por ejemplo 11 2345 6789.';
  }
}

/** Datos de seguimiento opcionales compartidos por el alta y los eventos. */
class DemoTrackingFieldsDto {
  @IsOptional()
  @Transform(trimOptional)
  @Matches(EVENT_ID_PATTERN, { message: 'eventId inválido' })
  eventId?: string;

  /** Cookie `_fbp` del píxel de Meta. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  fbp?: string;

  /** Cookie `_fbc` del píxel de Meta. */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  fbc?: string;

  /** URL de la página donde ocurrió el evento. */
  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @MaxLength(500)
  pageUrl?: string;
}

export class CreateDemoLeadDto extends DemoTrackingFieldsDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsNotEmpty({ message: 'Ingresá tu email.' })
  @IsEmail({}, { message: 'El email no es válido.' })
  @MaxLength(254, { message: 'El email es demasiado largo.' })
  email: string;

  @Transform(trim)
  @IsNotEmpty({ message: 'Ingresá tu teléfono.' })
  @IsString()
  @MaxLength(40, { message: 'El teléfono es demasiado largo.' })
  @Validate(IsPhoneARConstraint)
  phone: string;

  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @MaxLength(120, { message: 'El nombre es demasiado largo.' })
  name?: string;

  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @MaxLength(160, { message: 'El nombre del gimnasio es demasiado largo.' })
  gymName?: string;

  @IsBoolean({ message: 'Necesitamos tu consentimiento para contactarte.' })
  @Equals(true, { message: 'Necesitamos tu consentimiento para contactarte.' })
  consent: boolean;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  consentTextVersion: string;

  /** Campo trampa: invisible para personas. Si viene con texto, es un bot. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  website?: string;

  /** `?plan=` de la landing. Valores desconocidos se ignoran (no fallan). */
  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @MaxLength(30)
  plan?: string;

  @IsOptional() @Transform(trimOptional) @IsString() @MaxLength(200) utmSource?: string;
  @IsOptional() @Transform(trimOptional) @IsString() @MaxLength(200) utmMedium?: string;
  @IsOptional() @Transform(trimOptional) @IsString() @MaxLength(200) utmCampaign?: string;
  @IsOptional() @Transform(trimOptional) @IsString() @MaxLength(200) utmContent?: string;
  @IsOptional() @Transform(trimOptional) @IsString() @MaxLength(200) utmTerm?: string;

  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @MaxLength(500)
  referrer?: string;
}

export class TrackDemoEventDto extends DemoTrackingFieldsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(600)
  token: string;

  @IsIn(DEMO_CLIENT_EVENT_TYPES as readonly string[], { message: 'Tipo de evento inválido.' })
  type: DemoLeadEventType;

  /** Paso de la demo (obligatorio para `demo_step_viewed`). */
  @ValidateIf((o) => o.type === DemoLeadEventType.DEMO_STEP_VIEWED || o.step !== undefined)
  @IsString()
  @Matches(/^[a-z0-9_-]{1,40}$/, { message: 'Paso inválido.' })
  step?: string;

  /** Plan elegido (obligatorio para `start_clicked`). */
  @ValidateIf((o) => o.type === DemoLeadEventType.START_CLICKED || o.plan !== undefined)
  @IsIn(Object.values(DemoLeadPlan), { message: 'Plan inválido.' })
  plan?: DemoLeadPlan;
}

export class ListDemoLeadsQueryDto {
  @IsOptional()
  @IsIn(DEMO_LEAD_STATUSES, { message: 'Estado inválido.' })
  status?: DemoLeadStatus;

  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? value : Number(value)))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? value : Number(value)))
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class UpdateDemoLeadStatusDto {
  @IsIn(DEMO_LEAD_STATUSES, { message: 'Estado inválido.' })
  status: DemoLeadStatus;
}
