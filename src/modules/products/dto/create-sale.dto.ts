import { IsNotEmpty, IsString, IsNumber, IsEnum, IsOptional, Min } from 'class-validator';
import { PaymentMethod, StockLocation } from '../../../entities/sale.entity';

export class CreateSaleDto {
  @IsNotEmpty()
  @IsString()
  productId: string;

  @IsNotEmpty()
  @IsString()
  athleteId: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  quantity: number;

  @IsNotEmpty()
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @IsNotEmpty()
  @IsEnum(StockLocation)
  stockLocation: StockLocation;

  @IsOptional()
  @IsString()
  notes?: string;
}
