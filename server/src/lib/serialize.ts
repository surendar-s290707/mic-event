import type { CheckIn, Event, Registration, User } from '@prisma/client';

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
 * A ticket. The QR token is included because the owner needs to render it —
 * it is only ever returned to the attendee it belongs to.
 */
export function serializeTicket(
  registration: Registration & { checkIn: CheckIn | null; event: EventWithOrganizer; user: User },
) {
  return {
    id: registration.id,
    qrToken: registration.qrToken,
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
