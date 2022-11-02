import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { UserInterface } from '../models/interfaces/user.iterface';

export class UserRepository {
  constructor(
    @InjectModel('User')
    private model: Model<UserInterface>,
  ) {}

  async createUser(
    name: string,
    lastName: string,
    email: string,
    password: string,
    activeToken: string,
    isActive?: boolean,
  ): Promise<UserInterface> {
    const user = new this.model({ name, lastName, email, password, activeToken, isActive });
    return await user.save();
  }

  async findOneByEmail(email: string): Promise<UserInterface> {
    return await this.model.findOne({ email });
  }

  async findOneInactiveAndUpdate( _id: string, token: string, isActive: boolean,): Promise<UserInterface> {
    return await this.model.findOneAndUpdate(
      { _id, isActive: false, token },
      { isActive },
      { new: true },
    );
  }

  async findOneUpdate(email: string, data:any): Promise<UserInterface> {
    return await this.model.findOneAndUpdate({email}, data, {new: true});
  }

  async findOneByResetPassToken(token: string, password:string): Promise<UserInterface> {
    const resetPasswordToken = null;
    const data = {password, resetPasswordToken}
    return await this.model.findOneAndUpdate({token}, data, {new: true});
  }
}
