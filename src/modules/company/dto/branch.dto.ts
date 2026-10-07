import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class EnableBranchesDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;
}

export class CreateBranchDto {
  @IsString()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;
}

export class UpdateBranchDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
