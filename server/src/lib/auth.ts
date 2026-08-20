import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Response } from 'express';
import type { Role, User } from '@prisma/client';
import { env, isProduction } from '../env.js';

/**
 * Sessions are a signed JWT carried in an HTTP-only cookie.
 *
 * Why a cookie rather than a token in localStorage: JavaScript on the page
 * cannot read an HTTP-only cookie, so a script injected into the frontend
 * cannot steal the session. The browser attaches it automatically, and
 * SameSite=Lax keeps it off cross-site form posts.
 */

const COOKIE_NAME = 'mic_session';
const BCRYPT_ROUNDS = 10;

export interface SessionPayload {
  sub: string;
  role: Role;
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function issueSession(res: Response, user: Pick<User, 'id' | 'role'>): void {
  const token = jwt.sign({ sub: user.id, role: user.role } satisfies SessionPayload, env.jwtSecret, {
    expiresIn: `${env.sessionTtlDays}d`,
  });

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction, // requires HTTPS in production
    maxAge: env.sessionTtlDays * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearSession(res: Response): void {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: 'lax', secure: isProduction, path: '/' });
}

/** Returns the payload of a valid session cookie, or null. Never throws. */
export function readSession(cookies: Record<string, string | undefined>): SessionPayload | null {
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, env.jwtSecret);
    if (typeof decoded === 'string' || !decoded.sub) return null;
    return { sub: String(decoded.sub), role: decoded.role as Role };
  } catch {
    // Expired or tampered with — treated exactly like no session at all.
    return null;
  }
}

/** The only user shape that ever leaves the API. Note: no passwordHash. */
export function toPublicUser(user: User) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  };
}

export type PublicUser = ReturnType<typeof toPublicUser>;
