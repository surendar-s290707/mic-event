/**
 * Shapes returned by the API. These mirror server/src/lib/serialize.ts —
 * if a field is missing here, the server deliberately did not send it.
 */

export type Role = 'ORGANIZER' | 'ATTENDEE';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
}

/** The caller's own registration, attached to an event they can see. */
export interface MyRegistration {
  id: string;
  createdAt: string;
  checkedIn: boolean;
  checkedInAt: string | null;
}

export interface EventSummary {
  id: string;
  name: string;
  description: string;
  venue: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  organizer: { id: string; name: string };
  registeredCount: number;
  spotsLeft: number;
  /** Organizer-owner only — attendees never receive this. */
  checkedInCount?: number;
  myRegistration: MyRegistration | null;
}

export interface Ticket {
  id: string;
  qrToken: string;
  createdAt: string;
  checkedIn: boolean;
  checkedInAt: string | null;
  attendee: { id: string; name: string };
  event: { id: string; name: string; venue: string; startsAt: string; endsAt: string };
}

export interface EventStats {
  capacity: number;
  registeredCount: number;
  checkedInCount: number;
  spotsLeft: number;
  attendancePercent: number;
}

export interface RecentCheckIn {
  id: string;
  name: string;
  checkedInAt: string;
  stationId: string | null;
}

export interface StatsResponse {
  stats: EventStats;
  recentCheckIns: RecentCheckIn[];
  /** ISO timestamps of check-ins in the last two hours, for the arrivals chart. */
  arrivals: string[];
}

export type ScanFailureReason = 'ALREADY_CHECKED_IN' | 'INVALID_TICKET' | 'WRONG_EVENT';

export type ScanResult =
  | { success: true; message: string; attendee: { name: string }; checkedInAt: string }
  | {
      success: false;
      reason: ScanFailureReason;
      message: string;
      attendee?: { name: string };
      checkedInAt?: string | null;
    };

/** Derived from an event's own times — never stored, so it cannot go stale. */
export type EventStatus = 'upcoming' | 'live' | 'ended';
