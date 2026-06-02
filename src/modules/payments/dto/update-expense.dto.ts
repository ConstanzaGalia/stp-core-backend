import { IsNumber, IsOptional, IsString, IsDateString, IsIn, IsUUID } from 'class-validator';

export class UpdateExpenseDto {
  @IsOptional()
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
  @IsIn(['ARS', 'USD'])
  currency?: 'ARS' | 'USD';

  @IsOptional()
  @IsUUID()
  fixedExpenseTemplateId?: string | null;
}
