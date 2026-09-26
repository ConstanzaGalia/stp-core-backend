import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

/** Fila cruda; días/horas se normalizan y validan en el servicio. */
export class MigrateScheduleRowDto {
  @IsString()
  email: string;

  @IsArray()
  daysOfWeek: number[];

  @IsString()
  startTime: string;

  @IsString()
  endTime: string;

  @IsOptional()
  @Type(() => Number)
  rowNumber?: number;
}

export class MigrateSchedulesPreviewDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => MigrateScheduleRowDto)
  rows: MigrateScheduleRowDto[];
}

export class MigrateSchedulesConfirmDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => MigrateScheduleRowDto)
  rows: MigrateScheduleRowDto[];
}
