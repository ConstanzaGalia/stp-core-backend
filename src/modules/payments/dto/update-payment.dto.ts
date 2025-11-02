import { IsNumber, IsEnum, IsOptional, IsString, Min } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { PaymentStatus, PaymentMethod } from '../../../entities/payment.entity';

// Función para normalizar números con formato (remover puntos de miles)
function normalizeNumber(value: any): number {
  if (value === null || value === undefined) {
    return value;
  }
  
  if (typeof value === 'number') {
    return value;
  }
  
  if (typeof value === 'string') {
    // Remover espacios
    let normalized = value.trim();
    
    // Si tiene punto y después una coma o termina en punto seguido de 1-2 dígitos, es decimal
    // Ejemplo: "1.500,50" o "60.00" (60 con decimales)
    // Si tiene solo puntos y comas, analizar mejor
    if (normalized.includes(',') && normalized.includes('.')) {
      // Formato latino: puntos son miles, coma es decimal (ej: "60.000,50")
      normalized = normalized.replace(/\./g, ''); // Remover puntos
      normalized = normalized.replace(',', '.'); // Coma a punto decimal
    } else if (normalized.includes('.') && !normalized.includes(',')) {
      // Si tiene punto pero no coma, verificar si es separador de miles o decimal
      // Si hay más de un punto o el punto tiene más de 2 dígitos después, es separador de miles
      const parts = normalized.split('.');
      if (parts.length > 2 || (parts.length === 2 && parts[1].length > 2)) {
        // Es separador de miles: "60.000"
        normalized = normalized.replace(/\./g, '');
      }
      // Si tiene solo un punto con 1-2 dígitos después, es decimal: "60.00"
    } else if (normalized.includes(',') && !normalized.includes('.')) {
      // Formato europeo con coma decimal (ej: "60000,50")
      normalized = normalized.replace(',', '.');
    }
    
    const parsed = parseFloat(normalized);
    return isNaN(parsed) ? 0 : parsed;
  }
  
  return 0;
}

export class UpdatePaymentDto {
  @IsOptional()
  @Transform(({ value }) => normalizeNumber(value))
  @IsNumber()
  @Min(0)
  amount?: number; // Monto base

  @IsOptional()
  @Transform(({ value }) => normalizeNumber(value))
  @IsNumber()
  @Min(0)
  lateFee?: number; // Recargo por mora

  @IsOptional()
  @Transform(({ value }) => normalizeNumber(value))
  @IsNumber()
  @Min(0)
  discount?: number; // Descuento aplicado

  @IsEnum(PaymentStatus)
  @IsOptional()
  status?: PaymentStatus; // Estado del pago

  @IsEnum(PaymentMethod)
  @IsOptional()
  paymentMethod?: PaymentMethod; // Método de pago

  @IsString()
  @IsOptional()
  transactionId?: string; // ID de transacción

  @IsString()
  @IsOptional()
  notes?: string; // Notas adicionales

  @IsString()
  @IsOptional()
  dueDate?: string; // Fecha de vencimiento (ISO string)

  @IsString()
  @IsOptional()
  paidDate?: string; // Fecha de pago (ISO string)
}
