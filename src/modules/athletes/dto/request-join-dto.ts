import { IsString, IsOptional, MaxLength } from 'class-validator';

export class RequestJoinDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}
