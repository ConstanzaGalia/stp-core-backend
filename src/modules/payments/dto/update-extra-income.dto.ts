import { Type, Transform } from 'class-transformer';
import { IsNumber, IsOptional, IsString, IsDateString, IsIn } from 'class-validator';

export class UpdateExtraIncomeDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  amount?: number;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  description?: string;

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
