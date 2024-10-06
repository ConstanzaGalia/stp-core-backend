import { IsNotEmpty } from 'class-validator';

export class ActivateUserDTO {
  @IsNotEmpty()
  token: string;
}
