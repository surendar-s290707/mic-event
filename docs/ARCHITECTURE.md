# Architecture

How the app is put together today, and where each unbuilt piece will go. The aim is that a
reader — or a fresh session — can tell the difference between what runs and what is planned.

## Shape

```
browser ──/api/*──> Express (server/)          [today: health only]
   │                    └── PostgreSQL + Prisma  [milestone 2]
   └── React (client/) with all state in AppStore
```

One npm workspace, two packages. No microservices, no GraphQL, no message queue — a single API
process and a single database is enough for a campus event, and it is far easier to reason about
under concurrency.

## The mock boundary

Every screen reads and writes through one interface: `client/src/store/context.ts`. The provider
in `AppStore.tsx` implements it from `client/src/mock/data.ts`, which is the only file containing
fake data. When the API lands, `AppStore` starts making HTTP calls and the mock file is deleted;
no page component changes.

Anything still faked is marked in two ways: a comment block headed `CURRENT MOCK FUNCTIONALITY`
in the source, and a small "Mock" note in the UI itself, so a demo never implies more than exists.

## Decisions made so far

**Plain CSS with tokens, no UI framework.** One `tokens.css` file holds colour, type, spacing and
radius; `ui.css` maps one class block per primitive. It keeps the bundle small, makes the visual
language explicit, and avoids a build-time dependency for something this size.

**Status derived, never stored.** An event's `upcoming | live | ended` status is computed from
`startsAt`/`endsAt` on read (`lib/format.ts`). A stored status column would go stale the moment
nobody updates it.

**Times as ISO instants.** The API and store speak ISO strings; only the UI splits them into a
date and a time for display, and the create form converts back with `fromDateTimeInputs`.

**Client-side role gating is presentation only.** `RequireRole` hides screens. It is not security,
and the code says so. Authorization belongs in the API handlers.

**Dev proxy over CORS.** In development Vite proxies `/api` to Express, so the browser only ever
talks to one origin and there is no CORS configuration to get wrong. In production the API can
serve the built client from the same origin, or `VITE_API_BASE_URL` points at a separate host.

## Where the hard requirements will live

These are **not implemented**. This section records the intended design so the next session does
not have to rediscover it.

**1. Duplicate check-ins and capacity, correct under concurrency.**
Correctness has to sit in the database, because the API may run as several processes. A check-in
is an insert into `CheckIn` with `registrationId @unique`; the second scan violates the constraint
and the handler turns that violation into an `already_checked_in` response carrying the original
timestamp. Capacity is enforced inside a transaction that counts registrations with the event row
locked (`SELECT ... FOR UPDATE`) — or equivalently by an insert guarded by a conditional write —
so 500 simultaneous registrations for 50 seats produce exactly 50 rows. Proof will be a script
firing 100+ concurrent requests against two server processes sharing one database, with the log
attached. The draft constraints are already in `prisma/schema.prisma`.

**2. QR sharing / screenshots.**
The ticket carries a server-signed token, not a bare registration id. Planned approach: rotating
short-lived tokens (the ticket page refreshes them while online), falling back to single-use if
venue wifi makes rotation unreliable. The tradeoff — rotation needs the attendee's phone online,
single-use fails if a scan is lost after invalidation — goes in the write-up.
`components/QrPlaceholder.tsx` is the only place that changes on the client.

**3. Offline-first scanning.**
The scanner already funnels every scan through one `handleScan` function and has an offline state
in the UI. The real version queues scans in IndexedDB with a client-generated scan id, and replays
them on reconnect; `CheckIn.clientScanId @unique` makes the replay idempotent. The contested case
— scanned offline at station A, then online at station B — resolves to a single check-in, with
the earlier scan time kept and the later sync reported back as a duplicate rather than dropped.

**4. AI insights.**
The API computes the numbers (checked in, no-show rate, peak time, spots left) from the database,
then passes those computed values to the model as context; the model phrases them and never
invents figures. The key stays server-side, the endpoint has a timeout, and the dashboard falls
back to showing the raw stats when the call fails.

**Live dashboard.** Socket.IO room per event; the check-in handler emits after the transaction
commits. The dashboard component already re-renders from a single stats selector, so subscribing
is a local change.
