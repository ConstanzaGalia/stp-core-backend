import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class UpdateExerciseDto {
  @IsNotEmpty()
  @IsString()
  @IsOptional()
  name?: string;

  @IsOptional()
  @IsString()
  image?: string;

  @IsString()
  @IsOptional()
  categories?: string[];
}