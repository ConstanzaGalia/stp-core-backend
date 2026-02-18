import { IsOptional, IsString, IsNumber, IsBoolean, Min } from 'class-validator';

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priceCash?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priceTransfer?: number;

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
