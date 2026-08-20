import { Router } from 'express';
import { z } from 'zod';
import { Prisma, Role } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { ApiError, asyncHandler } from '../lib/errors.js';
import { parseBody } from '../lib/validate.js';
import {
  clearSession,
  hashPassword,
  issueSession,
  toPublicUser,
  verifyPassword,
} from '../lib/auth.js';
import { requireAuth } from '../middleware/auth.js';

export const authRouter = Router();

const signupSchema = z.object({
  name: z.string().trim().min(2, 'Tell us your name').max(80, 'That name is too long'),
  email: z.string().trim().toLowerCase().email('That doesn’t look like an email'),
  password: z.string().min(8, 'Use at least 8 characters').max(200),
  role: z.nativeEnum(Role, { errorMap: () => ({ message: 'Pick organizer or attendee' }) }),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('That doesn’t look like an email'),
  password: z.string().min(1, 'Enter your password'),
});

/** POST /api/auth/signup — create an account and start a session. */
authRouter.post(
  '/signup',
  asyncHandler(async (req, res) => {
    const input = parseBody(signupSchema, req.body);

    const user = await prisma.user
      .create({
        data: {
          name: input.name,
          email: input.email,
          passwordHash: await hashPassword(input.password),
          role: input.role,
        },
      })
      .catch((error: unknown) => {
        // Unique violation on email — the database decides, not a pre-check,
        // so two simultaneous signups cannot both succeed.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw ApiError.conflict('email_taken', 'That email already has an account. Log in instead.');
        }
        throw error;
      });

    issueSession(res, user);
    res.status(201).json({ user: toPublicUser(user) });
  }),
);

/** POST /api/auth/login */
authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const input = parseBody(loginSchema, req.body);

    const user = await prisma.user.findUnique({ where: { email: input.email } });
    // Same message whether the email is unknown or the password is wrong: a
    // different one would let anyone probe which emails have accounts.
    const invalid = ApiError.unauthorized('That email and password don’t match.');
    if (!user) throw invalid;

    const ok = await verifyPassword(input.password, user.passwordHash);
    if (!ok) throw invalid;

    issueSession(res, user);
    res.json({ user: toPublicUser(user) });
  }),
);

/** POST /api/auth/logout — clears the cookie; safe to call when signed out. */
authRouter.post('/logout', (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

/** GET /api/auth/me — who am I? 401 when there is no valid session. */
authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: toPublicUser(req.user!) });
  }),
);
