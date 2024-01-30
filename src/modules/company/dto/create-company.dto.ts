import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateCompanyDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsString()
  primary_color?: string;

  @IsOptional()
  @IsString()
  secondary_color?: string;
}
