import { IsString, IsNumber, IsEnum, IsOptional, Min, IsDateString, ValidateIf } from 'class-validator';
import { PaymentMethod } from '../../../entities/payment.entity';

export class CompletePaymentDto {
  @IsString()
  @IsOptional()
  paymentId?: string; // Si se indica, se completa este pago (ej. matrícula); si no, se usa el flujo por userId/plan/company

  @IsString()
  userId: string; // ID del atleta

  @ValidateIf(o => !o.paymentId)
  @IsString()
  paymentPlanId?: string; // Requerido solo si no se envía paymentId

  @IsString()
  companyId: string; // ID de la empresa/centro

  @IsNumber()
  @Min(0)
  amount: number; // Monto de la cuota mensual

  @IsNumber()
  @Min(0)
  @IsOptional()
  discount?: number; // Descuento aplicado

  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @IsString()
  @IsOptional()
  transactionId?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsDateString()
  @IsOptional()
  startDate?: string; // Fecha de inicio de la suscripción (opcional, por defecto hoy)

  @IsDateString()
  @IsOptional()
  paidDate?: string; // Fecha del pago (opcional, por defecto hoy)
}
