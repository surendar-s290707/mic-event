/**
 * Domain types.
 *
 * These deliberately mirror the tables we will create with Prisma in the next
 * milestone (User, Event, Registration, CheckIn), so swapping mock state for
 * real API responses is mostly a change of data source, not of shape.
 */

export type Role = 'ORGANIZER' | 'ATTENDEE';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface EventItem {
  id: string;
  name: string;
  description: string;
  venue: string;
  /** ISO string. Stored as one instant; the UI splits it into date + time. */
  startsAt: string;
  endsAt: string;
  capacity: number;
  organizerId: string;
}

export interface Registration {
  id: string;
  eventId: string;
  attendeeId: string;
  attendeeName: string;
  createdAt: string;
  /**
   * MOCK: a stable, human-readable code printed into the QR.
   * FUTURE: replaced by a signed, short-lived / single-use token that the
   * server issues and validates (hard requirement #2).
   */
  ticketCode: string;
}

export type CheckInMethod = 'SCAN' | 'MANUAL' | 'OFFLINE_SYNC';

export interface CheckIn {
  id: string;
  eventId: string;
  registrationId: string;
  attendeeName: string;
  checkedInAt: string;
  method: CheckInMethod;
}

/** Derived from startsAt / endsAt — not stored, so it can never go stale. */
export type EventStatus = 'upcoming' | 'live' | 'ended';

export interface EventStats {
  capacity: number;
  registered: number;
  checkedIn: number;
  spotsLeft: number;
  /** 0–100, share of registered attendees who have checked in. */
  attendancePercent: number;
}

/** The outcomes the scanner has to be able to show (spec section 12). */
export type CheckInOutcome =
  | 'success'
  | 'already_checked_in'
  | 'invalid_ticket'
  | 'wrong_event'
  | 'offline_saved';

export interface CheckInResultData {
  outcome: CheckInOutcome;
  attendeeName?: string;
  /** Set for already_checked_in — the time of the original scan. */
  checkedInAt?: string;
  ticketCode?: string;
}
