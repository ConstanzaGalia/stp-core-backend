import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ClubAnalyticsSexScope } from 'src/common/enums/enums';

export class CreateClubAnalyticsTrainerDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsString()
  @MinLength(1)
  lastName: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  clubCode: string;

  @IsEnum(ClubAnalyticsSexScope)
  sexScope: ClubAnalyticsSexScope;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}

export class UpdateClubAnalyticsTrainerDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  clubCode?: string;

  @IsOptional()
  @IsEnum(ClubAnalyticsSexScope)
  sexScope?: ClubAnalyticsSexScope;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class CreateClubAnalyticsTrainerBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateClubAnalyticsTrainerDto)
  trainers: CreateClubAnalyticsTrainerDto[];
}
