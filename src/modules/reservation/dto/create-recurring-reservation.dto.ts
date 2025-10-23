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
  @IsString()
  timeSlotId: string; // ID del slot que se quiere reservar

  @IsString()
  companyId: string; // ID de la empresa

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

  @IsInt()
  @Min(1)
  capacity: number; // Capacidad del slot

  @IsString()
  frequency: RecurringFrequency; // 'weekly' o 'monthly'

  @IsDateString()
  startDate: string; // Fecha de inicio de las reservas recurrentes

  @IsString()
  endType: RecurringEndType; // 'date', 'count' o 'never'

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

