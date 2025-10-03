import { IsString, IsNumber, IsEnum, IsOptional, Min } from 'class-validator';
import { PaymentMethod } from '../../../entities/payment.entity';

export class ProcessPaymentDto {
  @IsString()
  subscriptionId: string;

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
}

