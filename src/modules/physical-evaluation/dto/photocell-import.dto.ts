import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class PhotocellImportDto {
  @IsUUID()
  athleteId: string;

  @IsDateString()
  evaluationDate: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  protocolCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  sourceName?: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  headers: string[];

  @IsArray()
  rows: Array<Array<string | null>>;
}
