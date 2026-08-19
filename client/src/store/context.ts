import { createContext, useContext } from 'react';
import type {
  CheckIn,
  CheckInResultData,
  EventItem,
  EventStats,
  Registration,
  Role,
  User,
} from '../lib/types';

export interface CreateEventInput {
  name: string;
  description: string;
  venue: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
}

export type RegisterResult =
  | { ok: true; registration: Registration }
  | { ok: false; reason: 'event_full' | 'already_registered' | 'not_signed_in' };

export interface AppContextValue {
  // --- session (MOCK auth) ---
  user: User | null;
  signIn: (email: string, password: string, role: Role) => Promise<User>;
  signOut: () => void;

  // --- data ---
  events: EventItem[];
  registrations: Registration[];
  checkIns: CheckIn[];

  // --- selectors ---
  getEvent: (eventId: string) => EventItem | undefined;
  getOrganizer: (organizerId: string) => User | undefined;
  getStats: (eventId: string) => EventStats;
  getRegistrationsFor: (eventId: string) => Registration[];
  getCheckInsFor: (eventId: string) => CheckIn[];
  getMyRegistration: (eventId: string) => Registration | undefined;
  isCheckedIn: (registrationId: string) => boolean;

  // --- actions (MOCK: in-memory only) ---
  createEvent: (input: CreateEventInput) => EventItem;
  registerForEvent: (eventId: string) => RegisterResult;
  checkInByTicketCode: (
    ticketCode: string,
    eventId: string,
    options?: { offline?: boolean },
  ) => CheckInResultData;
  /** Ticket codes for the scanner's demo buttons — no real camera yet. */
  sampleTicketCodes: (eventId: string) => { fresh?: string; used?: string; otherEvent?: string };
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside <AppProvider>');
  return value;
}
