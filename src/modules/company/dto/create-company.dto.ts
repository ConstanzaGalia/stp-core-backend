import { Transform } from "class-transformer";
import { IsNotEmpty, IsOptional, IsString } from "class-validator";

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
}
