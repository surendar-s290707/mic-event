# Checkpoint — milestone 2: real core application

Last updated: 2026-08-20. Previous milestone: UI foundation on mock data.
Historical log: [docs/PROGRESS.md](docs/PROGRESS.md). Design notes:
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Endpoints: [docs/API.md](docs/API.md).

**State: the core system is real.** No mock data remains anywhere in the application. Every screen
reads and writes PostgreSQL through the API.

---

## Implemented

| Area | Status | Notes |
| ---- | ------ | ----- |
| Database | ✅ | PostgreSQL 16 via Docker Compose, Prisma, one migration, seed script |
| Authentication | ✅ | bcrypt (cost 10) + JWT in an HTTP-only, SameSite=Lax cookie |
| Authorization | ✅ | `requireAuth` / `requireRole` / per-event ownership, enforced in the API |
| Event creation | ✅ | Server-validated, creator becomes owner |
| Event listing | ✅ | Role-scoped: organizers see their own, attendees see open events |
| Registration | ✅ | Transactional capacity + unique `(eventId, userId)` |
| QR tokens | ✅ | 32 random bytes, base64url, unique, carries no personal data |
| Attendee ticket | ✅ | Real scannable QR via `qrcode`, owner-only |
| Scanner | ✅ | Real camera via `html5-qrcode`, cooldown, typed-code fallback |
| Check-in | ✅ | Four verdicts; duplicates caught by a unique constraint |
| Duplicate protection | ✅ | Insert-then-catch, verified with 12 simultaneous scans |
| Event dashboard | ✅ | Live DB counts, recent check-ins, arrivals chart, 10s polling |
| Attendee status | ✅ | Registered / Checked in, straight from the database |
| CSV export | ✅ | Owner-only; name, email, registered at, status, timestamp |
| Error handling | ✅ | Typed API errors; loading / empty / error states on every screen |
| Offline scanning | ✅ | IndexedDB queue, auto-sync on reconnect, idempotent replay |
| Tests | ✅ | 59 integration tests against a real database |

## Not implemented yet

| Requirement | Milestone |
| ----------- | --------- |
| Socket.IO live dashboard (polling for now) | 3 |
| Standalone 100+ concurrent request proof script + log | 3 |
| Rotating / expiring QR tokens (currently long-lived opaque tokens) | 4 |
| AI natural-language insights, server-side | 4 |

---

## Commands

```bash
npm install
cp .env.example .env      # then set JWT_SECRET: openssl rand -hex 32
npm run db:up             # PostgreSQL in Docker
npm run db:migrate        # apply migrations
npm run db:seed           # demo data (deletes all rows first)
npm start                 # API :4000 + client :5173

npm test                  # 39 integration tests
npm run build             # typecheck + build both packages
npm run lint
```

Demo accounts (password `mic12345`): `aditi@mic.dev` (organizer),
`sneha@student.mic.dev` (attendee). Or sign up at `/signup`.

---

## Offline scanning and the conflict policy

A scan is queued in IndexedDB (not memory — the tab may reload) whenever the device is offline or the
request fails mid-scan. Each scan carries a `clientScanId` generated on the device, which is a unique
column on `CheckIn`, so replaying the queue can never insert twice. The queue flushes automatically
when the browser fires `online`, and on arriving at the scanner with scans still pending.

Every server verdict is final, so the queue entry is dropped whatever comes back — checked in,
already synced, already checked in, invalid, wrong event. Only a failed *request* leaves a scan
queued for the next attempt.

**One check-in row per registration: first write wins, earliest scan time wins.**

The case in the brief — scanned offline at station A, then online at station B before A reconnects:
B's scan creates the row. When A syncs, no second row is created and A is told
`ALREADY_CHECKED_IN` — never silently dropped. Because A's scan really happened earlier,
`checkedInAt` is corrected backwards to A's time, so the arrivals chart and "when did check-ins
peak" reflect the door rather than the network. The alternative — letting the later sync overwrite
or insert — would either lose the true arrival time or break the one-row guarantee that makes
duplicate protection provable.

The device clock is not trusted blindly: a `scannedAt` in the future or more than a day old is
ignored in favour of server time.

## Database

Four tables. The constraints are the design:

```
User         id, name, email (unique), passwordHash, role, createdAt
Event        id, name, description, venue, startsAt, endsAt, capacity, organizerId → User
Registration id, eventId → Event, userId → User, qrToken (unique), createdAt
             UNIQUE (eventId, userId)          ← one seat per person per event
CheckIn      id, registrationId → Registration (UNIQUE), checkedInAt, stationId,
             clientScanId (UNIQUE, nullable)
             UNIQUE registrationId             ← one check-in per registration
             UNIQUE clientScanId               ← replaying a queued scan is a no-op
```

`prisma/migrations/20260820191250_init` is the only migration so far.

## Authentication

Signup and login set `mic_session`: a JWT signed with `JWT_SECRET`, HTTP-only (JavaScript cannot read
it), `SameSite=Lax`, `Secure` in production, 7-day expiry. `requireAuth` re-reads the user row on
every request rather than trusting the token's contents.

## QR design

The QR holds only an opaque `qrToken` — 32 random bytes, base64url. No name, email or event id, so a
leaked screenshot reveals nothing about its owner and is useless without an organizer session.

**Current limitation:** the token is long-lived and stays valid after check-in (a second scan is
rejected because the registration already has a check-in row, not because the token was invalidated).
Screenshot-sharing is therefore only *partly* mitigated: the second person to arrive is refused, but
the system cannot tell which of the two was the real attendee. Milestone 4 replaces this with
short-lived rotating tokens, and the write-up will cover the tradeoff.

---

## Verification performed

**Automated** — `npm test`: 59 tests, 59 passing, 0 failing (~12s).

- auth: signup, login, wrong password, logout, unauthenticated rejection, duplicate email, malformed
  input, bcrypt hash stored, no `passwordHash` in any response, tampered cookie rejected
- authorization: attendee cannot create an event; organizer cannot read stats / scan / export another
  organizer's event; attendee cannot reach organizer endpoints; check-in counts hidden from
  attendees; one attendee cannot read another's ticket
- registration: valid, duplicate, nonexistent event, finished event, invalid capacity (0, negative,
  fractional, non-numeric), backwards dates
- check-in: valid, duplicate (with the original timestamp), invalid token, wrong event, empty token
- offline: queued scan checks in on sync and keeps the door time; replaying a batch (serially and
  8× concurrently) never makes a second check-in; A-syncs-after-B reports a duplicate and corrects
  the time backwards; the later queued scan leaves the time alone; invalid and wrong-event scans are
  judged identically to live ones; a bad device clock is ignored; ownership still enforced
- concurrency: 20 simultaneous registrations on a capacity-3 event → exactly 3 rows; 12 simultaneous
  scans of one ticket → exactly 1 check-in row

**Manual, end to end in a browser** — organizer signup → create event (rejecting a past date and
capacity 0 first) → attendee signup (rejecting a 5-character password) → register (3 seats → 2) →
open ticket → scan → duplicate scan → invalid scan → dashboard → attendee status → CSV download.

The rendered QR image was decoded with `html5-qrcode` and matched the token the API issued exactly.

Also checked: the API rejects `PORT`-less startup with a clear message, unknown API paths return JSON
404s, and the production build serves client routes from `client/dist`.

---

## Known limitations

1. **Camera scanning was not verified with a real camera.** The test browser has no camera device;
   the failure path was verified (clear message, retry button, typed-code fallback intact), and the
   decode path was verified by decoding the generated QR with the same library. Point a real phone at
   a ticket before demoing.
2. **QR tokens do not expire or rotate** — see the QR design note above.
3. **The dashboard polls** every 10 seconds instead of using WebSockets.
4. **No rate limiting** on login or signup; a determined attacker can guess passwords as fast as
   bcrypt allows (~10/second/core).
5. **`npm run start:prod` sets `NODE_ENV` inline**, which does not work on Windows shells. Deployment
   platforms set it themselves.
6. **Events cannot be edited or deleted** — creation only.
7. **The seed deletes every row.** It refuses to run when `NODE_ENV=production`.

---

## Next milestone (3) — offline and live

1. Offline scan queue in IndexedDB with a client-generated scan id; add `clientScanId` (unique,
   nullable) to `CheckIn` so replaying a queued scan is idempotent.
2. Sync endpoint that replays queued scans and reports per-scan outcomes, including the
   scanned-offline-at-A-then-online-at-B case (keep the earliest check-in, report the later as a
   duplicate rather than dropping it).
3. Socket.IO room per event; emit after the check-in transaction commits; the dashboard subscribes
   and the polling interval comes out.
4. Standalone concurrency proof: a script firing 100+ simultaneous requests at **two** API processes
   sharing one database, with the output committed under `docs/`.
