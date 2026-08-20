import type { CheckIn, Event, Registration, User } from '@prisma/client';
import { issueTicketToken } from './ticketToken.js';

/**
 * One place that decides what the API exposes.
 *
 * Two rules it enforces:
 *  - no password hashes, ever;
 *  - attendees never receive organizer-only figures (check-in counts, other
 *    people's names). The organizer fields are only filled in for the
 *    organizer who owns the event.
 */

export interface EventCounts {
  registeredCount: number;
  checkedInCount: number;
}

type EventWithOrganizer = Event & { organizer: Pick<User, 'id' | 'name'> };

export function serializeEvent(
  event: EventWithOrganizer,
  counts: EventCounts,
  viewer: { isOwner: boolean },
  myRegistration?: (Registration & { checkIn: CheckIn | null }) | null,
) {
  return {
    id: event.id,
    name: event.name,
    description: event.description,
    venue: event.venue,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
    capacity: event.capacity,
    organizer: { id: event.organizer.id, name: event.organizer.name },
    registeredCount: counts.registeredCount,
    spotsLeft: Math.max(0, event.capacity - counts.registeredCount),
    // Attendance is the organizer's business, not the crowd's.
    checkedInCount: viewer.isOwner ? counts.checkedInCount : undefined,
    myRegistration: myRegistration
      ? {
          id: myRegistration.id,
          createdAt: myRegistration.createdAt.toISOString(),
          checkedIn: Boolean(myRegistration.checkIn),
          checkedInAt: myRegistration.checkIn?.checkedInAt.toISOString() ?? null,
        }
      : null,
  };
}

export type SerializedEvent = ReturnType<typeof serializeEvent>;

/**
 * A ticket.
 *
 * `qrPayload` is a freshly issued token that expires in a minute; the
 * registration's permanent secret is never serialized, so there is nothing
 * durable in this response for a screenshot or a copied network body to reuse.
 */
export function serializeTicket(
  registration: Registration & { checkIn: CheckIn | null; event: EventWithOrganizer; user: User },
) {
  const token = issueTicketToken(registration.id, registration.qrToken);

  return {
    id: registration.id,
    qrPayload: token.payload,
    qrExpiresAt: token.expiresAt,
    qrTtlSeconds: token.ttlSeconds,
    createdAt: registration.createdAt.toISOString(),
    checkedIn: Boolean(registration.checkIn),
    checkedInAt: registration.checkIn?.checkedInAt.toISOString() ?? null,
    attendee: { id: registration.user.id, name: registration.user.name },
    event: {
      id: registration.event.id,
      name: registration.event.name,
      venue: registration.event.venue,
      startsAt: registration.event.startsAt.toISOString(),
      endsAt: registration.event.endsAt.toISOString(),
    },
  };
}
