import { Transform } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
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

export const SIGNUP_PLAN_VALUES = ['STP_PERSONAL', 'STP_CENTER', 'personal', 'center'] as const;
export type SignupPlanValue = (typeof SIGNUP_PLAN_VALUES)[number];

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

  /**
   * Plan elegido en el alta self-service. Si viene, el centro arranca con prueba gratuita
   * y suscripción PAID pendiente. Se normaliza con `planIdFromSlug`.
   */
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsIn(SIGNUP_PLAN_VALUES)
  signupPlan?: SignupPlanValue;

  /** Solo con signupPlan=STP_CENTER: agrega el cargo pendiente de migración de datos. */
  @IsOptional()
  @IsBoolean()
  includeMigration?: boolean;
}
