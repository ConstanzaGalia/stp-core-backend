import { IsNotEmpty } from 'class-validator';

export class ActivateUserDTO {
  @IsNotEmpty()
  _id: string;

  @IsNotEmpty()
  token: string;
}
