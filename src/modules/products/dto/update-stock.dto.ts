import { IsOptional, IsNumber, IsUUID, Min } from 'class-validator';

export class UpdateStockDto {
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
  @IsUUID()
  branchId?: string;
}
