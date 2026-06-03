import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AssociationRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}
