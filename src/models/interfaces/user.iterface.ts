// import { ObjectId } from 'mongoose';

export interface UserInterface {
  id: string;
  name: string,
  lastName: string,
  email: string,
  password: string,
  role?: string
  // athletes?: [{ type: mongoose.Schema.Types.ObjectId, ref: 'athlete' }],
  phoneNumber?: number,
  country?: string,
  city?: string,
  imageProfile?: string,
  createdAt?: string
  isActive?: boolean,
  activeToken?: string,
  resetPasswordToken?: string,
  isDelete?: boolean,
  deleteAt?: string,
}