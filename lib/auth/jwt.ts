import { SignJWT, jwtVerify } from 'jose';
import { UserRole } from '@/lib/db/models/user.model';

const JWT_SECRET_STRING =
  process.env.JWT_SECRET || 'cit-nexus-fallback-secure-secret-key-32-chars-long-2026';
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_STRING);

export const COOKIE_NAME = 'cit_nexus_session';

export interface UserPayload {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isVerified: boolean;
}

export async function signSessionToken(payload: UserPayload): Promise<string> {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_SECRET);

  return token;
}

export async function verifySessionToken(token: string): Promise<UserPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return {
      id: payload.id as string,
      name: payload.name as string,
      email: payload.email as string,
      role: payload.role as UserRole,
      isVerified: payload.isVerified as boolean,
    };
  } catch {
    return null;
  }
}

