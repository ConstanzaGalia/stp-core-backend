import { IsNotEmpty, IsNumber, IsOptional, IsString, IsDateString, IsIn, IsUUID } from 'class-validator';

export class CreateExpenseDto {
  @IsNotEmpty()
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
  @IsIn(['ARS', 'USD', 'EUR'])
  currency?: 'ARS' | 'USD' | 'EUR';

  @IsOptional()
  @IsUUID()
  fixedExpenseTemplateId?: string;
}
