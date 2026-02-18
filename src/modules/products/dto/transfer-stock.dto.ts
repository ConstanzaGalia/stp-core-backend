import { IsNotEmpty, IsNumber, IsEnum, Min } from 'class-validator';

export enum StockSource {
  DEPOSIT = 'DEPOSIT',
  FRIDGE = 'FRIDGE',
  COUNTER = 'COUNTER'
}

export enum StockDestination {
  DEPOSIT = 'DEPOSIT',
  FRIDGE = 'FRIDGE',
  COUNTER = 'COUNTER'
}

export class TransferStockDto {
  @IsNotEmpty()
  @IsEnum(StockSource)
  from: StockSource;

  @IsNotEmpty()
  @IsEnum(StockDestination)
  to: StockDestination;

  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  quantity: number;
}
