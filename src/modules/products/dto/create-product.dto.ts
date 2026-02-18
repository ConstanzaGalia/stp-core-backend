import { IsNotEmpty, IsString, IsNumber, IsOptional, IsBoolean, Min } from 'class-validator';

export class CreateProductDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  priceCash: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  priceTransfer: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  stockDeposit?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  stockFridge?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  stockCounter?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
