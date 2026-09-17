import { Transform } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";
import { CENTER_CURRENCIES } from "src/common/center-currencies";
import { CompanyAccountType } from "src/common/enums/enums";

const emptyToUndefined = ({ value }: { value: unknown }) =>
  value === '' || value === null ? undefined : value;

const emptyToNull = ({ value }: { value: unknown }) => {
  if (value === undefined) return undefined;
  if (value === '' || value === null) return null;
  return typeof value === 'string' ? value.trim() : value;
};

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

  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_, value) => typeof value === 'string')
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  @Matches(/^(?=.*?[A-Z])(?=.*?[a-z])(?=.*?[0-9])(?=.*?[^\w\s]).{8,}$/, {
    message: 'La contraseña temporal debe tener al menos 8 caracteres, mayúscula, minúscula, número y símbolo',
  })
  temporaryPassword?: string | null;
}
