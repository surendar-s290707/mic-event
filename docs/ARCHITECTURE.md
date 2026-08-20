# Architecture

How the app is put together today, and where each unbuilt piece will go. The aim is that a
reader — or a fresh session — can tell the difference between what runs and what is planned.

## Shape

```
browser ──/api/*──> Express (server/) ──> PostgreSQL (Prisma)
   │                    requireAuth -> requireRole -> ownership check
   └── React (client/): SessionProvider holds who is signed in,
       each screen fetches its own data with useAsync
```

One npm workspace, two packages. No microservices, no GraphQL, no message queue — a single API
process and a single database is enough for a campus event, and it is far easier to reason about
under concurrency.

## No mock layer

There is none left. `client/src/mock/data.ts` and the in-memory store were deleted in milestone 2;
every screen now calls `client/src/lib/api.ts`, which is the only file that knows a URL. The session
lives in an HTTP-only cookie, so no token is ever handled in JavaScript — `SessionProvider` just
caches the answer to `GET /api/auth/me`.

Data fetching is deliberately plain: `useAsync` runs a request, exposes `{ data, loading, error,
reload }`, and screens render the three states. No client-side cache, because a check-in desk wants
the database's answer, not a stale one.

## Decisions made so far

**Plain CSS with tokens, no UI framework.** One `tokens.css` file holds colour, type, spacing and
radius; `ui.css` maps one class block per primitive. It keeps the bundle small, makes the visual
language explicit, and avoids a build-time dependency for something this size.

**Status derived, never stored.** An event's `upcoming | live | ended` status is computed from
`startsAt`/`endsAt` on read (`lib/format.ts`). A stored status column would go stale the moment
nobody updates it.

**Times as ISO instants.** The API and store speak ISO strings; only the UI splits them into a
date and a time for display, and the create form converts back with `fromDateTimeInputs`.

**Client-side role gating is presentation only.** `RequireRole` hides screens. The real boundary is
`requireAuth` -> `requireRole` -> an ownership check inside each handler, and the test suite attacks
it directly with hand-written requests rather than through the UI.

**Correctness lives in the database.** Capacity is enforced by a transaction that locks the event row
before counting; duplicate registrations and duplicate check-ins are unique indexes. Application code
attempts the write and translates the constraint violation into a friendly message. A read-then-write
check would pass for two simultaneous requests — a unique index cannot.

**Scan verdicts are 200s.** `already checked in`, `invalid ticket` and `wrong event` are answers, not
transport failures: the request worked, the ticket did not. Authentication and ownership failures
stay 401/403.

**Dev proxy over CORS.** In development Vite proxies `/api` to Express, so the browser only ever
talks to one origin and there is no CORS configuration to get wrong. In production the API can
serve the built client from the same origin, or `VITE_API_BASE_URL` points at a separate host.

## The hard requirements

**1. Duplicate check-ins and capacity — implemented.**
Both are database constraints, because the API may run as several processes and an in-process lock
would not survive that. A check-in is an insert into `CheckIn` with `registrationId @unique`; the
second scan violates it and the handler returns `ALREADY_CHECKED_IN` with the original timestamp.
Registration runs in a transaction that locks the event row (`SELECT … FOR UPDATE`) before counting,
so simultaneous requests queue and each sees committed rows. The test suite asserts both: 20 parallel
registrations on a capacity-3 event leave exactly 3 rows, 12 parallel scans leave exactly 1 check-in.
Still to come: the same proof run against **two** API processes sharing one database, with the log
committed.

**2. QR sharing / screenshots — partly addressed.**
The QR carries an opaque 32-byte token and nothing else, so a leaked image reveals nothing about its
owner. But the token is long-lived, so a screenshot sent to a friend still works until someone uses
it — the second arrival is refused, without the system knowing which person was genuine. Milestone 4
adds short-lived rotating tokens; the tradeoff (rotation needs the attendee's phone online) belongs
in the write-up.

**3. Offline-first scanning — not built.**
The scanner funnels every scan through one `submitToken` function, which is where the queue goes.
The plan: IndexedDB queue with a client-generated scan id, replayed on reconnect, with
`CheckIn.clientScanId` unique so replays are idempotent. The contested case — scanned offline at
station A, then online at station B — resolves to a single check-in: keep the earlier scan time,
report the later sync as a duplicate rather than dropping it. `CheckIn.stationId` already records
which device scanned.

**4. AI insights — not built.**
`GET /api/events/:id/stats` already computes the numbers an organizer would ask about (checked in,
turnout, spots left, arrival times). The AI endpoint passes those computed values to the model as
context so it phrases them without inventing figures; the key stays server-side, the call gets a
timeout, and the dashboard falls back to the raw stats when it fails.

**Live dashboard — polling today.** The dashboard re-queries `/stats` every 10 seconds. Socket.IO
(a room per event, emitting after the check-in transaction commits) replaces the interval; the
component already renders from one stats object, so subscribing is a local change.
