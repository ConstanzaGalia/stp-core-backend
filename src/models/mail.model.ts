import * as mongoose from 'mongoose';
const emailStatus = ['ERROR', 'SUCCESS'];

export const MailSchema = new mongoose.Schema(
  {
    email: { type: String, required: true },
    subject: { type: String, required: true },
    status: { type: String,
      enum: {
        values: emailStatus,
        message: '{VALUE} is not supported',
      },
    },
    errorPurpose: { type: String },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    deleteAt: Date || null,
  },
  {
    timestamps: true,
    versionKey: false,
  },
);