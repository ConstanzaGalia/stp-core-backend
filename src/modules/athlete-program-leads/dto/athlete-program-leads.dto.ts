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
  Max,
  MaxLength,
  Min,
  Validate,
} from 'class-validator';
import { IsPhoneARConstraint } from '../../demo-leads/dto/demo-leads.dto';
import {
  ATHLETE_PROGRAM_LEAD_STATUSES,
  ATHLETE_PROGRAM_MODALITIES,
  AthleteProgramLeadStatus,
  AthleteProgramModality,
} from '../athlete-program-leads.constants';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const trimOptional = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

export class CreateAthleteProgramLeadDto {
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

  @Transform(trim)
  @IsNotEmpty({ message: 'Ingresá tu nombre.' })
  @IsString()
  @MaxLength(120, { message: 'El nombre es demasiado largo.' })
  name: string;

  @IsIn(ATHLETE_PROGRAM_MODALITIES, { message: 'Elegí si querés entrenar online o en el gimnasio.' })
  modality: AthleteProgramModality;

  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @MaxLength(160, { message: 'El programa es demasiado largo.' })
  programInterest?: string;

  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @MaxLength(400, { message: 'El mensaje es demasiado largo.' })
  message?: string;

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

  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  @MaxLength(500)
  pageUrl?: string;
}

export class ListAthleteProgramLeadsQueryDto {
  @IsOptional()
  @IsIn(ATHLETE_PROGRAM_LEAD_STATUSES, { message: 'Estado inválido.' })
  status?: AthleteProgramLeadStatus;

  @IsOptional()
  @IsIn(ATHLETE_PROGRAM_MODALITIES, { message: 'Modalidad inválida.' })
  modality?: AthleteProgramModality;

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

export class UpdateAthleteProgramLeadStatusDto {
  @IsIn(ATHLETE_PROGRAM_LEAD_STATUSES, { message: 'Estado inválido.' })
  status: AthleteProgramLeadStatus;
}
