import { IsBoolean, IsEmail, IsEnum, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { ClubAnalyticsSexScope } from 'src/common/enums/enums';
import { ATAH_CLUBS, type AtahClubCode } from 'src/common/constants/atah-clubs';

const CLUB_CODES = ATAH_CLUBS.map((c) => c.code);

export class CreateClubAnalyticsTrainerDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsString()
  @MinLength(1)
  lastName: string;

  @IsEmail()
  email: string;

  @IsIn(CLUB_CODES)
  clubCode: AtahClubCode;

  @IsEnum(ClubAnalyticsSexScope)
  sexScope: ClubAnalyticsSexScope;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}

export class UpdateClubAnalyticsTrainerDto {
  @IsOptional()
  @IsIn(CLUB_CODES)
  clubCode?: AtahClubCode;

  @IsOptional()
  @IsEnum(ClubAnalyticsSexScope)
  sexScope?: ClubAnalyticsSexScope;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
