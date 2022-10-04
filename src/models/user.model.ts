import * as mongoose from 'mongoose';
const roleAllowed = ['stpAdmin', 'trainer', 'subTrainer', 'athlete'];

export const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true},
    password: { type: String, required: true },
    role: {
      type: String,
      default: 'trainer',
      enum: {
        values: roleAllowed,
        message: '{VALUE} is not supported',
      },
    },
    athletes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'athlete' }],
    phoneNumber: Number,
    country: String,
    city: String,
    imageProfile: String,
    createdAt: {
      type: Date,
      default: Date.now,
    },
    isActive: { type: Boolean, default: false },
    activeToken: {type: String, unique: true},
    resetPasswordToken: {type: String, default: null},
    isDelete: { type: Boolean, default: false },
    deleteAt: Date || null,
  },
  {
    timestamps: true,
    versionKey: false,
  },
);
