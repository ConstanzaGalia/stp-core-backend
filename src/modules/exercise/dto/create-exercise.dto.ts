import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateExerciseDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  image?: string;

  @IsString()
  categories: string[];
}