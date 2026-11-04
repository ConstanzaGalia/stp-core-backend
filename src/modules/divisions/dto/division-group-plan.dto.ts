import {
  IsArray,
  IsIn,
  IsObject,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SaveDivisionGroupPlanDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @IsIn(['fuerza', 'carrera'])
  objective: 'fuerza' | 'carrera';

  @IsObject()
  criteria: Record<string, unknown>;

  /** Forma y pertenencia de los atletas se validan en `validateGroupPlanInput`. */
  @IsArray()
  groups: unknown[];

  @IsArray()
  unassigned: unknown[];
}
