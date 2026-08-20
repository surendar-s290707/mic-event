import type { NextFunction, Request, Response } from 'express';
import type { Role, User } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { ApiError, asyncHandler } from '../lib/errors.js';
import { readSession } from '../lib/auth.js';

// Attach the signed-in user to the request, for handlers to use.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

/**
 * Loads the user named by the session cookie. The row is read on every request
 * rather than trusted from the token, so a deleted or role-changed account
 * stops working immediately instead of at token expiry.
 */
export const requireAuth = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const session = readSession(req.cookies ?? {});
  if (!session) throw ApiError.unauthorized();

  const user = await prisma.user.findUnique({ where: { id: session.sub } });
  if (!user) throw ApiError.unauthorized('Your session is no longer valid. Log in again.');

  req.user = user;
  next();
});

/**
 * Role check. Always used after requireAuth — this is the real security
 * boundary; the frontend's route guards only decide what to render.
 */
export function requireRole(role: Role) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (req.user.role !== role) {
      return next(
        ApiError.forbidden(
          role === 'ORGANIZER'
            ? 'Only organizers can do that.'
            : 'Only attendees can do that.',
        ),
      );
    }
    next();
  };
}
