import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { ApiError, asyncHandler } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { serializeTicket } from '../lib/serialize.js';

export const registrationsRouter = Router();

registrationsRouter.use(requireAuth);

/**
 * GET /api/registrations/:id — one ticket, by registration id.
 *
 * Only the attendee it belongs to may read it: the QR token is in the
 * response, so anyone else fetching it could check in as that person.
 */
registrationsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const registration = await prisma.registration.findUnique({
      where: { id: req.params.id },
      include: {
        checkIn: true,
        user: true,
        event: { include: { organizer: { select: { id: true, name: true } } } },
      },
    });

    // Same answer for "does not exist" and "not yours", so ids cannot be probed.
    if (!registration || registration.userId !== req.user!.id) {
      throw ApiError.notFound('We couldn’t find that ticket.');
    }

    res.json({ ticket: serializeTicket(registration) });
  }),
);
