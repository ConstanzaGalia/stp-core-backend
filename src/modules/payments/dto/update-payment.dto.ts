import { IsNumber, IsEnum, IsOptional, IsString, Min } from 'class-validator';
import { PaymentStatus, PaymentMethod } from '../../../entities/payment.entity';

export class UpdatePaymentDto {
  @IsNumber()
  @Min(0)
  @IsOptional()
  amount?: number; // Monto base

  @IsNumber()
  @Min(0)
  @IsOptional()
  lateFee?: number; // Recargo por mora

  @IsNumber()
  @Min(0)
  @IsOptional()
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
