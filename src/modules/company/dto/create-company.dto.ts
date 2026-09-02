import { Transform } from "class-transformer";
import { ArrayMinSize, IsArray, IsEnum, IsIn, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { CENTER_CURRENCIES } from "src/common/center-currencies";
import { CompanyAccountType } from "src/common/enums/enums";

const emptyToUndefined = ({ value }: { value: unknown }) =>
  value === '' || value === null ? undefined : value;

export class CreateCompanyDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  image?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  primary_color?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  secondary_color?: string;

  @IsOptional()
  @IsEnum(CompanyAccountType)
  accountType?: CompanyAccountType;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsIn([...CENTER_CURRENCIES], { each: true })
  enabledCurrencies?: string[];

  @IsOptional()
  @IsIn([...CENTER_CURRENCIES])
  defaultCurrency?: string;
}
