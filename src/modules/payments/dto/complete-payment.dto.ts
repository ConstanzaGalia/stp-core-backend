import { IsString, IsNumber, IsEnum, IsOptional, Min, IsDateString } from 'class-validator';
import { PaymentMethod } from '../../../entities/payment.entity';

export class CompletePaymentDto {
  @IsString()
  userId: string; // ID del atleta

  @IsString()
  paymentPlanId: string; // ID del plan de pago

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
}
