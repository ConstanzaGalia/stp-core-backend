import { IsString, IsOptional, MaxLength } from 'class-validator';

export class ResponseInvitationDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  companyResponse?: string;
}
