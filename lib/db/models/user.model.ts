import mongoose, { Schema, Document, Model } from 'mongoose';

export type UserRole = 'Admin' | 'Department Coordinator' | 'Faculty' | 'Club Representative';

export interface IUser extends Document {
  name: string;
  email: string;
  password?: string;
  role: UserRole;
  isVerified: boolean;
  otp?: string | null;
  otpExpiresAt?: Date | null;
  googleId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password: {
      type: String,
      required: false, // Optional for Google OAuth users
    },
    role: {
      type: String,
      enum: ['Admin', 'Department Coordinator', 'Faculty', 'Club Representative'],
      default: 'Faculty',
      required: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    otp: {
      type: String,
      default: null,
    },
    otpExpiresAt: {
      type: Date,
      default: null,
    },
    googleId: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent re-compilation of model in Next.js hot-reloads
export const UserModel: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>('User', UserSchema);

