import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDto } from 'src/common/pagination/DTOs/pagination-query.dto';

export class ExerciseListQueryDto extends PaginationQueryDto {
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  companyId: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}
