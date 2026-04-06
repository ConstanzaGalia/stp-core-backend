import { IsNotEmpty, IsOptional, IsString, IsArray, IsNumber, IsEnum, IsDateString } from 'class-validator';
import { InjuryStatus } from 'src/entities/injury.entity';

export class CreateInjuryDto {
  @IsNotEmpty()
  @IsString()
  tipo: string;

  @IsNotEmpty()
  @IsDateString()
  fechaInicio: string;

  @IsOptional()
  @IsString()
  notas?: string;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  restrictionTagIds?: number[];
}

export class UpdateInjuryStatusDto {
  @IsNotEmpty()
  @IsEnum(InjuryStatus)
  estado: InjuryStatus;

  @IsOptional()
  @IsString()
  notas?: string;
}
