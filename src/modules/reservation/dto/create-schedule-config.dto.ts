import { IsString, IsInt, IsBoolean, Min, Max, IsOptional } from 'class-validator';

export class CreateScheduleConfigDto {
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek: number; // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado

  @IsString()
  startTime: string; // Formato "HH:MM"

  @IsString()
  endTime: string; // Formato "HH:MM"

  @IsInt()
  @Min(1)
  capacity: number; // Capacidad por hora

  @IsBoolean()
  @IsOptional()
  allowIntermediateSlots?: boolean; // Permite turnos intermedios/superpuestos

  @IsInt()
  @Min(1)
  @IsOptional()
  intermediateCapacity?: number; // Capacidad para turnos intermedios

  @IsInt()
  @Min(15)
  @Max(180)
  @IsOptional()
  slotDurationMinutes?: number; // Duración de cada turno principal (default: 60 min)

  @IsInt()
  @Min(15)
  @Max(120)
  @IsOptional()
  intermediateSlotDurationMinutes?: number; // Duración de turnos intermedios (default: 30 min)

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
} 