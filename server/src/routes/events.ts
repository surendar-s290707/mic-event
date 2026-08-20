import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { ApiError, asyncHandler } from '../lib/errors.js';
import { parseBody } from '../lib/validate.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { serializeEvent, serializeTicket } from '../lib/serialize.js';
import { toCsv } from '../lib/csv.js';

export const eventsRouter = Router();

// Everything below needs a session. Role and ownership are checked per route.
eventsRouter.use(requireAuth);

/** Opaque ticket value. 32 random bytes: not guessable, carries no user data. */
function newQrToken(): string {
  return randomBytes(32).toString('base64url');
}

const createEventSchema = z
  .object({
    name: z.string().trim().min(3, 'Give your event a name (at least 3 characters)').max(120),
    description: z.string().trim().max(2000).default(''),
    venue: z.string().trim().min(1, 'Where is it happening?').max(160),
    startsAt: z.string().datetime({ offset: true, message: 'Pick a valid date and time' }),
    endsAt: z.string().datetime({ offset: true, message: 'Pick a valid end time' }),
    capacity: z
      .number({ invalid_type_error: 'Capacity must be a number' })
      .int('Capacity must be a whole number')
      .positive('Capacity must be above 0')
      .max(100_000, 'That capacity is unrealistically large'),
  })
  .refine((data) => new Date(data.endsAt) > new Date(data.startsAt), {
    message: 'The event has to end after it starts',
    path: ['endsAt'],
  });

/** Counts for a set of events in two grouped queries rather than N+1. */
async function countsFor(eventIds: string[]) {
  if (eventIds.length === 0) return new Map<string, { registeredCount: number; checkedInCount: number }>();

  const [registered, checkedIn] = await Promise.all([
    prisma.registration.groupBy({
      by: ['eventId'],
      where: { eventId: { in: eventIds } },
      _count: { _all: true },
    }),
    prisma.registration.groupBy({
      by: ['eventId'],
      where: { eventId: { in: eventIds }, checkIn: { isNot: null } },
      _count: { _all: true },
    }),
  ]);

  const map = new Map(eventIds.map((id) => [id, { registeredCount: 0, checkedInCount: 0 }]));
  for (const row of registered) map.get(row.eventId)!.registeredCount = row._count._all;
  for (const row of checkedIn) map.get(row.eventId)!.checkedInCount = row._count._all;
  return map;
}

/**
 * GET /api/events
 * Organizers get their own events (`?scope=mine`, the default for them);
 * attendees get everything that has not finished, with their own registration
 * attached so the list can show "Registered" without a second request.
 */
eventsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const mineOnly = user.role === 'ORGANIZER' && req.query.scope !== 'all';

    const events = await prisma.event.findMany({
      where: mineOnly ? { organizerId: user.id } : { endsAt: { gte: new Date() } },
      orderBy: { startsAt: 'asc' },
      include: { organizer: { select: { id: true, name: true } } },
    });

    const counts = await countsFor(events.map((e) => e.id));
    const myRegistrations =
      user.role === 'ATTENDEE'
        ? await prisma.registration.findMany({
            where: { userId: user.id, eventId: { in: events.map((e) => e.id) } },
            include: { checkIn: true },
          })
        : [];
    const byEvent = new Map(myRegistrations.map((r) => [r.eventId, r]));

    res.json({
      events: events.map((event) =>
        serializeEvent(
          event,
          counts.get(event.id)!,
          { isOwner: event.organizerId === user.id },
          byEvent.get(event.id) ?? null,
        ),
      ),
    });
  }),
);

/** POST /api/events — organizers only; the creator becomes the owner. */
eventsRouter.post(
  '/',
  requireRole('ORGANIZER'),
  asyncHandler(async (req, res) => {
    const input = parseBody(createEventSchema, req.body);

    const event = await prisma.event.create({
      data: {
        name: input.name,
        description: input.description,
        venue: input.venue,
        startsAt: new Date(input.startsAt),
        endsAt: new Date(input.endsAt),
        capacity: input.capacity,
        organizerId: req.user!.id,
      },
      include: { organizer: { select: { id: true, name: true } } },
    });

    res.status(201).json({
      event: serializeEvent(event, { registeredCount: 0, checkedInCount: 0 }, { isOwner: true }, null),
    });
  }),
);

/** Loads an event or 404s. */
async function loadEvent(eventId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { organizer: { select: { id: true, name: true } } },
  });
  if (!event) throw ApiError.notFound('We couldn’t find that event.');
  return event;
}

/** Loads an event and refuses anyone who does not own it. */
async function loadOwnedEvent(eventId: string, organizerId: string) {
  const event = await loadEvent(eventId);
  if (event.organizerId !== organizerId) {
    throw ApiError.forbidden('That event belongs to another organizer.');
  }
  return event;
}

/** GET /api/events/:eventId */
eventsRouter.get(
  '/:eventId',
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const event = await loadEvent(req.params.eventId);
    const counts = (await countsFor([event.id])).get(event.id)!;

    const myRegistration =
      user.role === 'ATTENDEE'
        ? await prisma.registration.findUnique({
            where: { eventId_userId: { eventId: event.id, userId: user.id } },
            include: { checkIn: true },
          })
        : null;

    res.json({
      event: serializeEvent(event, counts, { isOwner: event.organizerId === user.id }, myRegistration),
    });
  }),
);

/**
 * POST /api/events/:eventId/register — attendees only.
 *
 * Capacity is enforced by the database, not by an application counter:
 * the transaction takes a row lock on the event (SELECT ... FOR UPDATE), so
 * concurrent registrations for the same event queue behind each other and each
 * one counts rows that are already committed. The unique index on
 * (eventId, userId) is the backstop against the same person registering twice.
 */
eventsRouter.post(
  '/:eventId/register',
  requireRole('ATTENDEE'),
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const eventId = req.params.eventId;

    const registration = await prisma
      .$transaction(async (tx) => {
        const rows = await tx.$queryRaw<{ id: string; capacity: number; endsAt: Date }[]>`
          SELECT id, capacity, "endsAt" FROM "Event" WHERE id = ${eventId} FOR UPDATE
        `;
        const event = rows[0];
        if (!event) throw ApiError.notFound('We couldn’t find that event.');
        if (event.endsAt.getTime() < Date.now()) {
          throw ApiError.conflict('registration_closed', 'That event has already finished.');
        }

        // Check "already registered" before capacity: someone who already holds
        // a seat should be told that, not that the event is full.
        const existing = await tx.registration.findUnique({
          where: { eventId_userId: { eventId, userId: user.id } },
          select: { id: true },
        });
        if (existing) {
          throw ApiError.conflict('already_registered', 'You’re already registered for this event.');
        }

        const taken = await tx.registration.count({ where: { eventId } });
        if (taken >= event.capacity) {
          throw ApiError.conflict('event_full', 'Every seat for this event is taken.');
        }

        return tx.registration.create({
          data: { eventId, userId: user.id, qrToken: newQrToken() },
          include: { checkIn: true, user: true, event: { include: { organizer: { select: { id: true, name: true } } } } },
        });
      })
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw ApiError.conflict('already_registered', 'You’re already registered for this event.');
        }
        throw error;
      });

    res.status(201).json({ ticket: serializeTicket(registration) });
  }),
);

/** GET /api/events/:eventId/registration — the caller's own ticket, or 404. */
eventsRouter.get(
  '/:eventId/registration',
  requireRole('ATTENDEE'),
  asyncHandler(async (req, res) => {
    const registration = await prisma.registration.findUnique({
      where: { eventId_userId: { eventId: req.params.eventId, userId: req.user!.id } },
      include: {
        checkIn: true,
        user: true,
        event: { include: { organizer: { select: { id: true, name: true } } } },
      },
    });
    if (!registration) throw ApiError.notFound('You’re not registered for this event yet.');

    res.json({ ticket: serializeTicket(registration) });
  }),
);

const checkInSchema = z.object({
  token: z.string().trim().min(1, 'Scan or type a ticket code'),
  stationId: z.string().trim().max(60).optional(),
});

/**
 * POST /api/events/:eventId/check-in — organizer who owns the event only.
 *
 * The four scan outcomes are returned with HTTP 200 and a `reason`, because
 * the request itself succeeded — the verdict belongs to the ticket, and the
 * scanner renders all four the same way. Authentication and ownership
 * failures are still 401/403.
 *
 * Duplicate protection is the unique index on CheckIn.registrationId: we
 * attempt the insert and treat a unique violation as ALREADY_CHECKED_IN. A
 * read-then-write check would let two simultaneous scans both pass the read.
 */
eventsRouter.post(
  '/:eventId/check-in',
  requireRole('ORGANIZER'),
  asyncHandler(async (req, res) => {
    const event = await loadOwnedEvent(req.params.eventId, req.user!.id);
    const input = parseBody(checkInSchema, req.body);

    const registration = await prisma.registration.findUnique({
      where: { qrToken: input.token },
      include: { user: true, checkIn: true },
    });

    if (!registration) {
      res.json({ success: false, reason: 'INVALID_TICKET', message: 'We don’t recognise this ticket.' });
      return;
    }

    if (registration.eventId !== event.id) {
      res.json({
        success: false,
        reason: 'WRONG_EVENT',
        message: 'This ticket belongs to another event.',
        attendee: { name: registration.user.name },
      });
      return;
    }

    try {
      const checkIn = await prisma.checkIn.create({
        data: { registrationId: registration.id, stationId: input.stationId ?? null },
      });
      res.json({
        success: true,
        message: 'Checked in successfully',
        attendee: { name: registration.user.name },
        checkedInAt: checkIn.checkedInAt.toISOString(),
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // Someone (or another scanner) got there first.
        const existing = await prisma.checkIn.findUnique({
          where: { registrationId: registration.id },
        });
        res.json({
          success: false,
          reason: 'ALREADY_CHECKED_IN',
          message: 'This ticket was already used.',
          attendee: { name: registration.user.name },
          checkedInAt: existing?.checkedInAt.toISOString() ?? null,
        });
        return;
      }
      throw error;
    }
  }),
);

/** GET /api/events/:eventId/stats — live dashboard numbers, owner only. */
eventsRouter.get(
  '/:eventId/stats',
  requireRole('ORGANIZER'),
  asyncHandler(async (req, res) => {
    const event = await loadOwnedEvent(req.params.eventId, req.user!.id);

    const [registeredCount, checkedInCount, recent] = await Promise.all([
      prisma.registration.count({ where: { eventId: event.id } }),
      prisma.checkIn.count({ where: { registration: { eventId: event.id } } }),
      prisma.checkIn.findMany({
        where: { registration: { eventId: event.id } },
        orderBy: { checkedInAt: 'desc' },
        take: 25,
        include: { registration: { include: { user: { select: { name: true } } } } },
      }),
    ]);

    // Arrival times for the dashboard's little chart: last two hours only.
    const since = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const arrivals = await prisma.checkIn.findMany({
      where: { registration: { eventId: event.id }, checkedInAt: { gte: since } },
      select: { checkedInAt: true },
    });

    res.json({
      stats: {
        capacity: event.capacity,
        registeredCount,
        checkedInCount,
        spotsLeft: Math.max(0, event.capacity - registeredCount),
        attendancePercent: registeredCount === 0 ? 0 : Math.round((checkedInCount / registeredCount) * 100),
      },
      recentCheckIns: recent.map((checkIn) => ({
        id: checkIn.id,
        name: checkIn.registration.user.name,
        checkedInAt: checkIn.checkedInAt.toISOString(),
        stationId: checkIn.stationId,
      })),
      arrivals: arrivals.map((a) => a.checkedInAt.toISOString()),
    });
  }),
);

/** GET /api/events/:eventId/export.csv — attendance for one owned event. */
eventsRouter.get(
  '/:eventId/export.csv',
  requireRole('ORGANIZER'),
  asyncHandler(async (req, res) => {
    const event = await loadOwnedEvent(req.params.eventId, req.user!.id);

    const registrations = await prisma.registration.findMany({
      where: { eventId: event.id },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { name: true, email: true } }, checkIn: true },
    });

    const csv = toCsv(
      ['Name', 'Email', 'Registered at', 'Check-in status', 'Checked in at'],
      registrations.map((registration) => [
        registration.user.name,
        registration.user.email,
        registration.createdAt.toISOString(),
        registration.checkIn ? 'Checked in' : 'Not checked in',
        registration.checkIn?.checkedInAt.toISOString() ?? '',
      ]),
    );

    const filename = `${event.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-attendance.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }),
);
