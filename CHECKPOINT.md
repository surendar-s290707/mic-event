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
| QR tokens | ✅ | Rotating signed tokens, 60s life; permanent secret stays server-side |
| Attendee ticket | ✅ | Real scannable QR via `qrcode`, owner-only |
| Scanner | ✅ | Real camera via `html5-qrcode`, cooldown, typed-code fallback |
| Check-in | ✅ | Four verdicts; duplicates caught by a unique constraint |
| Duplicate protection | ✅ | Insert-then-catch, verified with 12 simultaneous scans |
| Event dashboard | ✅ | Live DB counts, recent check-ins, arrivals chart |
| Attendee status | ✅ | Registered / Checked in, straight from the database |
| CSV export | ✅ | Owner-only; name, email, registered at, status, timestamp |
| Error handling | ✅ | Typed API errors; loading / empty / error states on every screen |
| Offline scanning | ✅ | IndexedDB queue, auto-sync on reconnect, idempotent replay |
| Live updates | ✅ | Socket.IO, authenticated, room per event, owner-only |
| AI insights | ✅ | Facts computed in SQL; the model only phrases them; raw-number fallback |
| Concurrency proof | ✅ | Two API processes, one database — see docs/concurrency-proof.log |
| Tests | ✅ | 80 integration tests against a real database |

## Not implemented yet

| Requirement | Milestone |
| ----------- | --------- |

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

## Live dashboard

Socket.IO shares the API's port. The handshake is authenticated with the same session cookie as the
REST API, and `join-event` refuses any room the caller does not own — check-in names are
organizer-only data, and a WebSocket must not become the way around that.

A committed check-in emits into `event:<id>`; the dashboard treats that as "your numbers are stale"
and re-reads `/stats`, so the socket never becomes a second, divergent way of computing the same
figures. Duplicate scans emit nothing. If the socket is down (blocked proxy, server restart) the
dashboard falls back to polling every 15 seconds rather than freezing, and shows
"Reconnecting…" instead of "Live".

## AI insights

`POST /api/events/:id/insights` takes a plain-English question. The server computes every figure
first — checked in, no-shows and the no-show percentage, spots left, the busiest 15-minute window,
first and last arrival — and passes only those finished numbers to Claude, with a system prompt
forbidding it from calculating, estimating or inventing anything. The model's only job is wording.
Both the answer and the `facts` it was based on come back, and the dashboard shows the key figures
as chips beside the answer so the organizer can check them.

The key lives in `ANTHROPIC_API_KEY`, server-side only; `server/src/lib/insights.ts` is never
imported by the client. With no key, a timeout (default 8s, `AI_TIMEOUT_MS`), an API error or an
empty response, the endpoint returns those same computed numbers as plain text, labelled "Raw
numbers" in the UI — the organizer always gets an answer. The frontend shows a spinner and disables
the Ask button while waiting.

The four required questions are the dashboard's suggested prompts, and every figure they need is
asserted in the test suite.

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

## QR design and the sharing tradeoff

A QR code is an image, so the QR holds nothing permanent. What the attendee's screen shows is a
token that dies after a minute:

```
MIC1.<registrationId>.<expiryUnixSeconds>.<hmac>
```

The HMAC covers all three parts plus the registration's permanent `qrToken`, keyed with
`JWT_SECRET`. The permanent secret is **never serialized** — it is in no API response — so there is
nothing durable for an attendee to copy out of their own network tab, and a screenshot taken at 6:30
is refused at 6:35 with "Code expired". The ticket page counts down and refetches before expiry, and
again whenever the phone comes back to the foreground.

**The tradeoff.** Rotating tokens need the *attendee's* phone to be online at the door. That is the
cost of the approach, and it is the reason it is paired with two things: the scanner queues offline
by itself (so patchy wifi at the venue only ever blocks the attendee's refresh, not the check-in),
and the ticket prints its current code as text, so an organizer can type it in for someone whose
phone is dead or offline.

The alternative — one-time tokens invalidated on scan — needs no connection but leaves a shared
screenshot valid until the first person walks in, and then refuses the genuine attendee with no way
to tell which of the two was real. Expiry makes the window minutes wide instead of days.

**Offline scans are judged at the door, not at sync time.** A scan queued at 18:30 and synced at
19:10 is validated against 18:30, so an honest offline check-in is not punished for the network. The
scanner is an authenticated organizer, so its clock is a trusted-enough witness, and `scannedAt` is
already clamped to a sane range (nothing in the future beyond a minute, nothing older than a day).

Duplicate protection is unchanged and independent: a registration can still only ever hold one
check-in row.

---

## Verification performed

**Automated** — `npm test`: 80 tests, 80 passing, 0 failing (~30s).

- auth: signup, login, wrong password, logout, unauthenticated rejection, duplicate email, malformed
  input, bcrypt hash stored, no `passwordHash` in any response, tampered cookie rejected
- authorization: attendee cannot create an event; organizer cannot read stats / scan / export another
  organizer's event; attendee cannot reach organizer endpoints; check-in counts hidden from
  attendees; one attendee cannot read another's ticket
- registration: valid, duplicate, nonexistent event, finished event, invalid capacity (0, negative,
  fractional, non-numeric), backwards dates
- check-in: valid, duplicate (with the original timestamp), invalid token, wrong event, empty token
- rotating tokens: the permanent secret never appears in any response; a new token is issued on
  every ticket read; an expired code is refused and lets nobody in; edited expiry, a swapped
  registration id and malformed codes are all rejected; a scan queued while the code was still
  valid syncs successfully, while one that was already stale at the door does not; wrong-event
  detection still works
- AI insights: the four required figures are computed correctly from the database, including the
  no-peak and nobody-registered edge cases; question validation; owner-only access; no key material
  in any response. Against a stub Anthropic endpoint: the model's wording is used on success, the
  computed facts and the "never calculate" instruction are actually sent, and a timeout, an API
  error and an empty response each fall back to the raw numbers with the right reason.
- offline: queued scan checks in on sync and keeps the door time; replaying a batch (serially and
  8× concurrently) never makes a second check-in; A-syncs-after-B reports a duplicate and corrects
  the time backwards; the later queued scan leaves the time alone; invalid and wrong-event scans are
  judged identically to live ones; a bad device clock is ignored; ownership still enforced
- live updates: a check-in reaches the watching organizer with nothing polling; offline-synced
  check-ins push too; duplicates emit nothing; joining a room requires ownership; attendees and
  sessionless sockets are refused; one event's check-ins never leak into another's room
- concurrency: 20 simultaneous registrations on a capacity-3 event → exactly 3 rows; 12 simultaneous
  scans of one ticket → exactly 1 check-in row

**Concurrency proof** — `npm run proof:concurrency` starts two API processes on ports 4101 and 4102
against the same database and hammers both at once. Output committed at
[docs/concurrency-proof.log](docs/concurrency-proof.log):

| Test | Result |
| ---- | ------ |
| 120 simultaneous registrations for 25 seats | 25 created, 95 `event_full`, **25 rows** — 376 ms |
| 60 simultaneous scans of one ticket | 1 succeeded, 59 `ALREADY_CHECKED_IN`, **1 row** — 72 ms |
| All 25 tickets scanned twice over, concurrently | **25 check-in rows**, one per registration |

Two processes is the point: an in-process mutex or a JavaScript counter passes on one process and
fails here. The guarantees come from the database — a `SELECT … FOR UPDATE` row lock inside the
registration transaction, and unique indexes on `(eventId, userId)` and `CheckIn.registrationId`.

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
4. **No rate limiting** on login or signup; a determined attacker can guess passwords as fast as
   bcrypt allows (~10/second/core).
5. **`npm run start:prod` sets `NODE_ENV` inline**, which does not work on Windows shells. Deployment
   platforms set it themselves.
6. **Events cannot be edited or deleted** — creation only.
7. **The seed deletes every row.** It refuses to run when `NODE_ENV=production`.

---

## Next milestone (3) — offline and live

4. Standalone concurrency proof: a script firing 100+ simultaneous requests at **two** API processes
   sharing one database, with the output committed under `docs/`.
