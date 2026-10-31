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

// Resilient in-memory store for fallback when demo MongoDB URI is active
declare global {
  var __memoryUsers: Map<string, UserRecord> | undefined;
}

const memoryUsers: Map<string, UserRecord> = global.__memoryUsers || new Map();
if (!global.__memoryUsers) {
  global.__memoryUsers = memoryUsers;
}

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const normalizedEmail = email.toLowerCase().trim();
  const db = await connectToDatabase();

  if (db) {
    try {
      const doc = await UserModel.findOne({ email: normalizedEmail }).lean().exec();
      if (doc) {
        const record: UserRecord = {
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
        memoryUsers.set(normalizedEmail, record);
        return record;
      }
    } catch (err) {
      console.warn('[UserStore] Mongo query failed, checking in-memory store:', (err as Error).message);
    }
  }

  const memoryUser = memoryUsers.get(normalizedEmail);
  return memoryUser || null;
}

export async function findUserById(id: string): Promise<UserRecord | null> {
  const db = await connectToDatabase();

  if (db) {
    try {
      const doc = await UserModel.findById(id).lean().exec();
      if (doc) {
        const record: UserRecord = {
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
        memoryUsers.set(doc.email.toLowerCase().trim(), record);
        return record;
      }
    } catch (err) {
      console.warn('[UserStore] Mongo query by ID failed:', (err as Error).message);
    }
  }

  for (const user of memoryUsers.values()) {
    if (user.id === id) return user;
  }
  return null;
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
  const db = await connectToDatabase();

  let hashedPassword: string | undefined = undefined;
  if (data.password) {
    hashedPassword = await bcrypt.hash(data.password, 12);
  }

  if (db) {
    try {
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

      const record: UserRecord = {
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

      memoryUsers.set(normalizedEmail, record);
      return record;
    } catch (err) {
      console.warn('[UserStore] Mongo create failed, falling back to in-memory store:', (err as Error).message);
    }
  }

  // Fallback in-memory creation
  const newUser: UserRecord = {
    id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    name: data.name,
    email: normalizedEmail,
    password: hashedPassword,
    role: data.role,
    isVerified: data.isVerified || false,
    otp: data.otp || null,
    otpExpiresAt: data.otpExpiresAt || null,
    googleId: data.googleId || null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  memoryUsers.set(normalizedEmail, newUser);
  return newUser;
}

export async function updateUserOtp(
  email: string,
  otp: string,
  otpExpiresAt: Date
): Promise<boolean> {
  const normalizedEmail = email.toLowerCase().trim();
  const db = await connectToDatabase();

  if (db) {
    try {
      await UserModel.updateOne(
        { email: normalizedEmail },
        { $set: { otp, otpExpiresAt } }
      ).exec();
    } catch (err) {
      console.warn('[UserStore] Mongo update OTP failed:', (err as Error).message);
    }
  }

  const user = memoryUsers.get(normalizedEmail);
  if (user) {
    user.otp = otp;
    user.otpExpiresAt = otpExpiresAt;
    user.updatedAt = new Date();
    memoryUsers.set(normalizedEmail, user);
    return true;
  }

  return true;
}

export async function verifyAndClearOtp(email: string, otpToTest: string): Promise<{
  success: boolean;
  message?: string;
  user?: UserRecord;
}> {
  const normalizedEmail = email.toLowerCase().trim();
  const user = await findUserByEmail(normalizedEmail);

  if (!user) {
    return { success: false, message: 'No registered user found with this email.' };
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

  // Clear OTP and mark verified
  const db = await connectToDatabase();
  if (db) {
    try {
      await UserModel.updateOne(
        { email: normalizedEmail },
        { $set: { isVerified: true, otp: null, otpExpiresAt: null } }
      ).exec();
    } catch (err) {
      console.warn('[UserStore] Mongo OTP clear failed:', (err as Error).message);
    }
  }

  const memoryUser = memoryUsers.get(normalizedEmail);
  if (memoryUser) {
    memoryUser.isVerified = true;
    memoryUser.otp = null;
    memoryUser.otpExpiresAt = null;
    memoryUser.updatedAt = new Date();
    memoryUsers.set(normalizedEmail, memoryUser);
  }

  user.isVerified = true;
  user.otp = null;
  user.otpExpiresAt = null;

  return { success: true, user };
}

export async function checkPassword(plainPassword: string, hashedPassword?: string): Promise<boolean> {
  if (!hashedPassword) return false;
  return bcrypt.compare(plainPassword, hashedPassword);
}
