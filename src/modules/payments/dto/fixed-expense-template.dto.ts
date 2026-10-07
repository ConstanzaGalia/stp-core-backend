import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, MaxLength, IsBoolean } from 'class-validator';

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
  @IsIn(['ARS', 'USD', 'EUR'])
  defaultCurrency?: 'ARS' | 'USD' | 'EUR';

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsBoolean()
  isShared?: boolean;
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
  @IsIn(['ARS', 'USD', 'EUR'])
  defaultCurrency?: 'ARS' | 'USD' | 'EUR';

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsBoolean()
  isShared?: boolean;
}
