import { IsString, IsArray, IsInt, IsDateString, Min, Max, ArrayNotEmpty, IsOptional } from 'class-validator';

export enum RecurringFrequency {
  WEEKLY = 'weekly',
  MONTHLY = 'monthly'
}

export enum RecurringEndType {
  DATE = 'date',
  COUNT = 'count',
  NEVER = 'never'
}

export class CreateRecurringReservationDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  daysOfWeek: number[]; // Ejemplo: [1, 3, 5] (Lunes, Miércoles, Viernes)

  @IsString()
  startTime: string; // Ejemplo: "08:00"

  @IsString()
  endTime: string; // Ejemplo: "09:00"

  @IsString()
  @IsOptional()
  companyId?: string; // ID de la empresa (opcional, se puede obtener del contexto)

  @IsString()
  @IsOptional()
  frequency?: RecurringFrequency; // 'weekly' o 'monthly' (por defecto: 'weekly')

  @IsDateString()
  @IsOptional()
  startDate?: string; // Fecha de inicio (por defecto: hoy)

  @IsString()
  @IsOptional()
  endType?: RecurringEndType; // 'date', 'count' o 'never' (por defecto: 'never')

  @IsDateString()
  @IsOptional()
  endDate?: string; // Solo si endType es 'date'

  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(52) // Máximo 1 año de reservas
  maxOccurrences?: number; // Solo si endType es 'count'

  @IsString()
  @IsOptional()
  notes?: string; // Notas opcionales para las reservas
}

