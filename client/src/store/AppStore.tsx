import { useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  checkIns as seedCheckIns,
  events as seedEvents,
  organizers,
  registrations as seedRegistrations,
  users as seedUsers,
} from '../mock/data';
import type {
  CheckIn,
  CheckInResultData,
  EventItem,
  EventStats,
  Registration,
  Role,
  User,
} from '../lib/types';
import { AppContext, type AppContextValue, type CreateEventInput, type RegisterResult } from './context';

/**
 * ===========================================================================
 * CURRENT MOCK FUNCTIONALITY
 * ===========================================================================
 * All application state lives in React state, seeded from mock/data.ts.
 * Creating an event, registering and checking in mutate that state only —
 * everything resets on page reload, and nothing is shared between browsers.
 *
 * FUTURE REAL IMPLEMENTATION
 * Each action below becomes one API call:
 *   signIn              -> POST /api/auth/login      (hashed password + JWT)
 *   createEvent         -> POST /api/events          (organizer-only)
 *   registerForEvent    -> POST /api/events/:id/registrations
 *                          capacity enforced inside a DB transaction
 *   checkInByTicketCode -> POST /api/check-ins
 *                          duplicate prevented by a UNIQUE constraint on
 *                          registrationId, not by the array scan used here
 * The component tree does not need to change when that happens: it only ever
 * sees the interface in store/context.ts.
 */

const SESSION_KEY = 'mic-event.session';

function loadSession(): User | null {
  try {
    const id = localStorage.getItem(SESSION_KEY);
    return seedUsers.find((u) => u.id === id) ?? null;
  } catch {
    return null;
  }
}

function newTicketCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `MIC-NEW-${out}`;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(loadSession);
  const [events, setEvents] = useState<EventItem[]>(seedEvents);
  const [registrations, setRegistrations] = useState<Registration[]>(seedRegistrations);
  const [checkIns, setCheckIns] = useState<CheckIn[]>(seedCheckIns);

  // --- session -------------------------------------------------------------

  /**
   * MOCK AUTHENTICATION — temporary.
   * There is no password hashing, no token and no server call here. It exists
   * so the role-aware UI can be built and demoed; it is replaced wholesale by
   * a real /api/auth/login + JWT + server-side role checks in milestone 3.
   */
  const signIn = useCallback(async (email: string, password: string, role: Role) => {
    await new Promise((resolve) => setTimeout(resolve, 550)); // fake latency

    const account = seedUsers.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    if (!account) {
      throw new Error("We couldn't find an account with that email. Try a demo account below.");
    }
    if (account.role !== role) {
      const actual = account.role === 'ORGANIZER' ? 'organizer' : 'attendee';
      throw new Error(`That's an ${actual} account. Switch the role above and try again.`);
    }
    if (password.trim().length < 4) {
      throw new Error('That password looks wrong. Demo password: mic1234');
    }

    try {
      localStorage.setItem(SESSION_KEY, account.id);
    } catch {
      /* private mode — session just won't survive a reload */
    }
    setUser(account);
    return account;
  }, []);

  const signOut = useCallback(() => {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
    setUser(null);
  }, []);

  // --- selectors -----------------------------------------------------------

  const getEvent = useCallback((eventId: string) => events.find((e) => e.id === eventId), [events]);

  const getOrganizer = useCallback(
    (organizerId: string) => organizers.find((o) => o.id === organizerId),
    [],
  );

  const getRegistrationsFor = useCallback(
    (eventId: string) => registrations.filter((r) => r.eventId === eventId),
    [registrations],
  );

  const getCheckInsFor = useCallback(
    (eventId: string) =>
      checkIns
        .filter((c) => c.eventId === eventId)
        .sort((a, b) => b.checkedInAt.localeCompare(a.checkedInAt)),
    [checkIns],
  );

  const getStats = useCallback(
    (eventId: string): EventStats => {
      const event = events.find((e) => e.id === eventId);
      const capacity = event?.capacity ?? 0;
      const registered = registrations.filter((r) => r.eventId === eventId).length;
      const checkedIn = checkIns.filter((c) => c.eventId === eventId).length;
      return {
        capacity,
        registered,
        checkedIn,
        spotsLeft: Math.max(0, capacity - registered),
        attendancePercent: registered === 0 ? 0 : Math.round((checkedIn / registered) * 100),
      };
    },
    [events, registrations, checkIns],
  );

  const getMyRegistration = useCallback(
    (eventId: string) =>
      user ? registrations.find((r) => r.eventId === eventId && r.attendeeId === user.id) : undefined,
    [registrations, user],
  );

  const isCheckedIn = useCallback(
    (registrationId: string) => checkIns.some((c) => c.registrationId === registrationId),
    [checkIns],
  );

  // --- actions -------------------------------------------------------------

  const createEvent = useCallback(
    (input: CreateEventInput): EventItem => {
      const event: EventItem = {
        id: `ev_${Date.now().toString(36)}`,
        name: input.name.trim(),
        description: input.description.trim(),
        venue: input.venue.trim(),
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        capacity: input.capacity,
        organizerId: user?.id ?? organizers[0].id,
      };
      setEvents((prev) => [event, ...prev]);
      return event;
    },
    [user],
  );

  const registerForEvent = useCallback(
    (eventId: string): RegisterResult => {
      if (!user) return { ok: false, reason: 'not_signed_in' };

      const event = events.find((e) => e.id === eventId);
      const taken = registrations.filter((r) => r.eventId === eventId);
      if (taken.some((r) => r.attendeeId === user.id)) {
        return { ok: false, reason: 'already_registered' };
      }
      // MOCK capacity check. The real one runs inside a database transaction so
      // 500 simultaneous requests can never produce capacity + 1 rows.
      if (event && taken.length >= event.capacity) {
        return { ok: false, reason: 'event_full' };
      }

      const registration: Registration = {
        id: `reg_${eventId}_${Date.now().toString(36)}`,
        eventId,
        attendeeId: user.id,
        attendeeName: user.name,
        createdAt: new Date().toISOString(),
        ticketCode: newTicketCode(),
      };
      setRegistrations((prev) => [...prev, registration]);
      return { ok: true, registration };
    },
    [events, registrations, user],
  );

  const checkInByTicketCode = useCallback(
    (ticketCode: string, eventId: string, options?: { offline?: boolean }): CheckInResultData => {
      const code = ticketCode.trim().toUpperCase();
      const registration = registrations.find((r) => r.ticketCode.toUpperCase() === code);

      if (!registration) return { outcome: 'invalid_ticket', ticketCode: code };
      if (registration.eventId !== eventId) {
        return { outcome: 'wrong_event', attendeeName: registration.attendeeName, ticketCode: code };
      }

      // MOCK offline branch: the real one writes to IndexedDB and replays the
      // scan when the connection returns, de-duplicating server-side.
      if (options?.offline) {
        return { outcome: 'offline_saved', attendeeName: registration.attendeeName, ticketCode: code };
      }

      const existing = checkIns.find((c) => c.registrationId === registration.id);
      if (existing) {
        return {
          outcome: 'already_checked_in',
          attendeeName: registration.attendeeName,
          checkedInAt: existing.checkedInAt,
          ticketCode: code,
        };
      }

      const checkIn: CheckIn = {
        id: `chk_${registration.id}_${Date.now().toString(36)}`,
        eventId,
        registrationId: registration.id,
        attendeeName: registration.attendeeName,
        checkedInAt: new Date().toISOString(),
        method: 'SCAN',
      };
      setCheckIns((prev) => [...prev, checkIn]);
      return { outcome: 'success', attendeeName: registration.attendeeName, ticketCode: code };
    },
    [checkIns, registrations],
  );

  const sampleTicketCodes = useCallback(
    (eventId: string) => {
      const forEvent = registrations.filter((r) => r.eventId === eventId);
      const checkedInIds = new Set(checkIns.map((c) => c.registrationId));
      return {
        fresh: forEvent.find((r) => !checkedInIds.has(r.id))?.ticketCode,
        used: forEvent.find((r) => checkedInIds.has(r.id))?.ticketCode,
        otherEvent: registrations.find((r) => r.eventId !== eventId)?.ticketCode,
      };
    },
    [checkIns, registrations],
  );

  const value = useMemo<AppContextValue>(
    () => ({
      user,
      signIn,
      signOut,
      events,
      registrations,
      checkIns,
      getEvent,
      getOrganizer,
      getStats,
      getRegistrationsFor,
      getCheckInsFor,
      getMyRegistration,
      isCheckedIn,
      createEvent,
      registerForEvent,
      checkInByTicketCode,
      sampleTicketCodes,
    }),
    [
      user, signIn, signOut, events, registrations, checkIns, getEvent, getOrganizer, getStats,
      getRegistrationsFor, getCheckInsFor, getMyRegistration, isCheckedIn, createEvent,
      registerForEvent, checkInByTicketCode, sampleTicketCodes,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

