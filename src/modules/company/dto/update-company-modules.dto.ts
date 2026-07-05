import { IsArray, IsIn, IsString } from 'class-validator';
import { CONFIGURABLE_CENTER_MODULE_IDS } from 'src/common/constants/center-modules';

export class UpdateCompanyModulesDto {
  @IsArray()
  @IsString({ each: true })
  @IsIn([...CONFIGURABLE_CENTER_MODULE_IDS], { each: true })
  enabledModules: string[];
}
