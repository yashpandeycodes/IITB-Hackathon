import { SignJWT, jwtVerify } from 'jose';
import { UserRole } from '@/lib/db/models/user.model';

// No fallback secret: a missing or short secret fails closed (signing throws, every token is invalid).
function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET ?? process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET (or AUTH_SECRET) must be set to at least 32 characters.');
  }
  return new TextEncoder().encode(secret);
}

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
    .sign(getJwtSecret());

  return token;
}

export async function verifySessionToken(token: string): Promise<UserPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
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

