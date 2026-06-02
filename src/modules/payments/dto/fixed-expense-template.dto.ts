import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, IsBoolean } from 'class-validator';

export class CreateFixedExpenseTemplateDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(150)
  name: string;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  defaultCategory?: string;

  @IsOptional()
  @IsIn(['ARS', 'USD'])
  defaultCurrency?: 'ARS' | 'USD';
}

export class UpdateFixedExpenseTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  defaultCategory?: string;

  @IsOptional()
  @IsIn(['ARS', 'USD'])
  defaultCurrency?: 'ARS' | 'USD';

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
