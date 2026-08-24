import { IsEnum } from 'class-validator';
import { CompanyAccountType } from 'src/common/enums/enums';

export class UpdateCompanyAccountTypeDto {
  @IsEnum(CompanyAccountType)
  accountType: CompanyAccountType;
}
