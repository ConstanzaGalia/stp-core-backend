import { IsNumber, IsOptional, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class PaginationQueryDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Transform(({ value }) => (!isNaN(parseInt(value)) ? parseInt(value) : 15))
  limit: number;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => (!isNaN(parseInt(value)) ? parseInt(value) : 0))
  offset: number;
}
