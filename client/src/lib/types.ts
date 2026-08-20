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
  /** Short-lived signed token shown in the QR. Expires — refetch to refresh. */
  qrPayload: string;
  qrExpiresAt: string;
  qrTtlSeconds: number;
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

export type ScanFailureReason =
  | 'ALREADY_CHECKED_IN'
  | 'INVALID_TICKET'
  | 'EXPIRED_TICKET'
  | 'WRONG_EVENT';

export type ScanResult =
  | {
      success: true;
      message: string;
      attendee?: { name: string };
      checkedInAt?: string | null;
      /** Set when this scan had already been synced — no new check-in was made. */
      reason?: 'ALREADY_SYNCED';
    }
  | {
      success: false;
      reason: ScanFailureReason;
      message: string;
      attendee?: { name: string };
      checkedInAt?: string | null;
      /** The queued scan was earlier, so the stored check-in time moved back. */
      reconciled?: boolean;
    };

/** One result per scan in a sync batch, in the order they were sent. */
export interface SyncResult {
  clientScanId: string;
  success: boolean;
  reason?: ScanFailureReason | 'ALREADY_SYNCED';
  message: string;
  attendee?: { name: string };
  checkedInAt?: string | null;
  reconciled?: boolean;
}

/** Client-only: the scan is in the local queue, not yet at the server. */
export interface QueuedLocally {
  queued: true;
  message: string;
}

export type ScannerFeedback = ScanResult | QueuedLocally;

/** Derived from an event's own times — never stored, so it cannot go stale. */
export type EventStatus = 'upcoming' | 'live' | 'ended';

export interface EventFacts {
  eventName: string;
  venue: string;
  startsAt: string;
  endsAt: string;
  status: EventStatus;
  capacity: number;
  registeredCount: number;
  checkedInCount: number;
  spotsLeft: number;
  noShowCount: number;
  noShowPercent: number;
  attendancePercent: number;
  firstCheckInAt: string | null;
  lastCheckInAt: string | null;
  peakWindow: { startsAt: string; endsAt: string; count: number } | null;
  busiestWindows: { startsAt: string; count: number }[];
}

export interface InsightAnswer {
  answer: string;
  facts: EventFacts;
  /** 'ai' when the model phrased it, 'fallback' when the raw numbers are shown. */
  source: 'ai' | 'fallback';
  fallbackReason?: 'not_configured' | 'timeout' | 'api_error';
}
