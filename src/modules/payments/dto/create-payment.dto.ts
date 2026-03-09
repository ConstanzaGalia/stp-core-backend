import { IsString, IsNumber, IsEnum, IsOptional, Min, IsDateString } from 'class-validator';
import { PaymentConcept } from '../../../entities/payment.entity';

export class CreatePaymentDto {
  @IsString()
  userId: string;

  @IsString()
  companyId: string;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsEnum(PaymentConcept)
  @IsOptional()
  concept?: PaymentConcept; // Por defecto SUBSCRIPTION; usar MATRICULA para matrícula (no genera clases)

  @IsString()
  @IsOptional()
  subscriptionId?: string; // Opcional: si es matrícula de alumno nuevo no tiene suscripción aún

  @IsString()
  @IsOptional()
  paymentPlanId?: string; // Requerido cuando no hay subscriptionId (ej. matrícula de alumno nuevo)

  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
