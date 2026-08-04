import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PhotocellBatchAthleteMappingDto {
  @IsString()
  @MaxLength(255)
  sourceNameHint: string;

  @IsUUID()
  athleteId: string;
}

export class PhotocellBatchPreviewDto {
  @IsDateString()
  evaluationDate: string;

  @IsOptional()
  @IsUUID()
  divisionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  protocolCode?: string;

  @IsOptional()
  @IsUUID()
  criteriaSetId?: string;

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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PhotocellBatchAthleteMappingDto)
  athleteMappings?: PhotocellBatchAthleteMappingDto[];
}

export class PhotocellBatchConfirmItemDto {
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

  /** Si true, crea aunque exista duplicado athlete+date+protocol. */
  @IsOptional()
  @IsBoolean()
  forceCreate?: boolean;
}

export class PhotocellBatchConfirmDto {
  @IsOptional()
  @IsUUID()
  divisionId?: string;

  @IsOptional()
  @IsUUID()
  criteriaSetId?: string;

  @IsOptional()
  @IsIn(['skip', 'error'])
  onDuplicate?: 'skip' | 'error';

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PhotocellBatchConfirmItemDto)
  items: PhotocellBatchConfirmItemDto[];
}

export class BulkDuplicateCheckItemDto {
  @IsUUID()
  athleteId: string;

  @IsDateString()
  evaluationDate: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  device?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  protocolCode?: string;
}

export class BulkDuplicateCheckDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BulkDuplicateCheckItemDto)
  items: BulkDuplicateCheckItemDto[];
}
