import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { PaymentMethod, StockLocation } from '../../../entities/sale.entity';

export class UpdateSaleDto {
  @IsOptional()
  @IsString()
  athleteId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsEnum(StockLocation)
  stockLocation?: StockLocation;

  @IsOptional()
  @IsString()
  notes?: string;
}
