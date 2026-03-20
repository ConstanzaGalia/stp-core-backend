import { Type, Transform } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsOptional, IsString, IsDateString, IsIn } from 'class-validator';

export class CreateExtraIncomeDto {
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  amount: number;

  @IsNotEmpty()
  @IsDateString()
  date: string;

  @IsNotEmpty()
  @IsString()
  description: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  concept?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    return typeof value === 'string' ? value.trim().toUpperCase() : value;
  })
  @IsIn(['ARS', 'USD'])
  currency?: 'ARS' | 'USD';
}
