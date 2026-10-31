import bcrypt from 'bcryptjs';
import { connectToDatabase } from './mongodb';
import { UserModel, UserRole } from './models/user.model';

export interface UserRecord {
  id: string;
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

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const normalizedEmail = email.toLowerCase().trim();
  await connectToDatabase();

  const doc = await UserModel.findOne({ email: normalizedEmail }).lean().exec();
  if (!doc) return null;

  return {
    id: doc._id.toString(),
    name: doc.name,
    email: doc.email,
    password: doc.password,
    role: doc.role as UserRole,
    isVerified: doc.isVerified,
    otp: doc.otp,
    otpExpiresAt: doc.otpExpiresAt,
    googleId: doc.googleId,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export async function findUserById(id: string): Promise<UserRecord | null> {
  await connectToDatabase();

  const doc = await UserModel.findById(id).lean().exec();
  if (!doc) return null;

  return {
    id: doc._id.toString(),
    name: doc.name,
    email: doc.email,
    password: doc.password,
    role: doc.role as UserRole,
    isVerified: doc.isVerified,
    otp: doc.otp,
    otpExpiresAt: doc.otpExpiresAt,
    googleId: doc.googleId,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export async function createUser(data: {
  name: string;
  email: string;
  password?: string;
  role: UserRole;
  isVerified?: boolean;
  otp?: string;
  otpExpiresAt?: Date;
  googleId?: string;
}): Promise<UserRecord> {
  const normalizedEmail = data.email.toLowerCase().trim();
  await connectToDatabase();

  let hashedPassword: string | undefined = undefined;
  if (data.password) {
    hashedPassword = await bcrypt.hash(data.password, 12);
  }

  const created = await UserModel.create({
    name: data.name,
    email: normalizedEmail,
    password: hashedPassword,
    role: data.role,
    isVerified: data.isVerified || false,
    otp: data.otp || null,
    otpExpiresAt: data.otpExpiresAt || null,
    googleId: data.googleId || null,
  });

  console.log(`[UserStore] >>> SAVED TO MONGODB ATLAS: ${created.email} (${created._id}) <<<`);

  return {
    id: created._id.toString(),
    name: created.name,
    email: created.email,
    password: created.password,
    role: created.role as UserRole,
    isVerified: created.isVerified,
    otp: created.otp,
    otpExpiresAt: created.otpExpiresAt,
    googleId: created.googleId,
    createdAt: created.createdAt,
    updatedAt: created.updatedAt,
  };
}

export async function updateUserOtp(
  email: string,
  otp: string,
  otpExpiresAt: Date
): Promise<boolean> {
  const normalizedEmail = email.toLowerCase().trim();
  await connectToDatabase();

  const res = await UserModel.updateOne(
    { email: normalizedEmail },
    { $set: { otp, otpExpiresAt } }
  ).exec();

  console.log(`[UserStore] >>> UPDATED OTP IN MONGODB ATLAS for ${normalizedEmail} <<<`);
  return res.acknowledged;
}

export async function verifyAndClearOtp(email: string, otpToTest: string): Promise<{
  success: boolean;
  message?: string;
  user?: UserRecord;
}> {
  const normalizedEmail = email.toLowerCase().trim();
  const user = await findUserByEmail(normalizedEmail);

  if (!user) {
    return { success: false, message: 'No registered user found with this email in the database.' };
  }

  if (!user.otp || !user.otpExpiresAt) {
    return { success: false, message: 'No active OTP verification request found.' };
  }

  if (new Date() > new Date(user.otpExpiresAt)) {
    return { success: false, message: 'OTP has expired. Please request a new code.' };
  }

  if (user.otp !== otpToTest.trim()) {
    return { success: false, message: 'Invalid 6-digit OTP code.' };
  }

  await UserModel.updateOne(
    { email: normalizedEmail },
    { $set: { isVerified: true, otp: null, otpExpiresAt: null } }
  ).exec();

  console.log(`[UserStore] >>> MARKED USER VERIFIED IN MONGODB ATLAS: ${normalizedEmail} <<<`);

  user.isVerified = true;
  user.otp = null;
  user.otpExpiresAt = null;

  return { success: true, user };
}

export async function checkPassword(plainPassword: string, hashedPassword?: string): Promise<boolean> {
  if (!hashedPassword) return false;
  return bcrypt.compare(plainPassword, hashedPassword);
}
