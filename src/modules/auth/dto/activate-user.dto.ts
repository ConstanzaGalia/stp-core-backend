import { IsNotEmpty } from 'class-validator';

export class ActivateUserDTO {
  @IsNotEmpty()
  id: string;

  @IsNotEmpty()
  token: string;
}
