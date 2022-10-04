import { Injectable } from '@nestjs/common';
import * as bcrypt from "bcrypt";
const SALT_ROUNDS = 10;

@Injectable()
export class EncryptService {
  async encryptedData(data:string): Promise<string> {
    const salt = await bcrypt.genSalt(SALT_ROUNDS);
    const bcryptData = await bcrypt.hash(
      data,
      salt
    );
    return bcryptData;
  };
  async compareData (userData:string, compareData:string): Promise<boolean> {
    const correctData = await bcrypt.compare(
      userData,
      compareData
    );
    return correctData;
  };
  
}
