# Progress log

History, newest last. For the current state of the system, read
[CHECKPOINT.md](../CHECKPOINT.md) — this file is the record of how it got there.

---

## Milestone 1 — UI foundation and basic flow ✅ (2026-08-19)

Goal: a polished, navigable app skeleton with a working basic flow on mock data, plus a real
backend to build on. Deliberately **no** database, auth, QR security, offline sync, sockets or AI.

### Working now

| Area      | Screens                                                                            |
| --------- | ---------------------------------------------------------------------------------- |
| Public    | `/` landing, `/login` (mock auth, role selector, demo accounts)                     |
| Organizer | `/organizer`, `/organizer/events`, `/organizer/events/new`, `/organizer/events/:id`, `/organizer/events/:id/scan`, `/organizer/events/:id/dashboard` |
| Attendee  | `/attendee`, `/attendee/events`, `/attendee/events/:id`, `/attendee/ticket/:id`     |
| API       | `GET /api/health`, JSON 404 and error handling, static client in production          |

Mock flows that actually run: sign in as either role, create an event (validated), register for an
event, open a ticket, scan a ticket and see all five check-in results, watch counts update.

### Verified (2026-08-19)

| Check                                | How                                                                 | Result |
| ------------------------------------ | ------------------------------------------------------------------- | ------ |
| Both packages build                  | `npm run build`                                                      | pass   |
| Lint clean                           | `npm run lint`                                                       | pass   |
| Health endpoint                      | `curl localhost:4000/api/health`                                     | 200, `status: ok` |
| Unknown API path                     | `curl localhost:4000/api/nope`                                       | 404 JSON |
| Dev proxy                            | `curl localhost:5173/api/health`                                     | 200 (see note) |
| Production mode                      | `NODE_ENV=production npm run start:prod`, deep link `/attendee/ticket/...` | 200 HTML |
| Login: empty, unknown email, wrong role, bad password, success | browser, login form                        | correct message each time; success lands on `/organizer` |
| Signed-out route guard               | visit `/organizer` with no session                                   | redirect to `/login` |
| Wrong-role guard                     | attendee visits `/organizer/events/ev_1/scan`                        | "That area is for a different role" |
| Create event: empty, past date, capacity 0, valid | browser, create form                                    | field errors, then created + redirect + success banner |
| Register for an event                | attendee events list                                                 | 11 → 12 registered, card switches to "My ticket" |
| Scanner states                       | scan, rescan, invalid code, other event's code, offline toggle       | success / already checked in (with time) / invalid / wrong event / saved offline; counter only moves on success |
| No horizontal scroll at 375px        | 8 routes measured (`scrollWidth` vs `innerWidth`)                    | none overflow |

Note: the dev proxy originally read `PORT`, which some dev runners set for Vite itself — it then
proxied to its own port. It now uses `VITE_DEV_API_TARGET` with a `127.0.0.1:4000` default.

### Known limitations

- All state is in browser memory: created events and registrations vanish on reload.
- Mock sign-in accepts any password of 4+ characters for a known demo email; there are no tokens.
- Route guards are client-side only, so they hide screens rather than protect data.
- The QR on a ticket is drawn, not encoded — no scanner can read it.
- The scanner has no camera; scans come from buttons or a typed ticket code.
- Duplicate and capacity checks are array lookups in the browser — correct for one user, and no
  substitute for the database constraints they will become.
- "Export attendance" is a button with an explanation, not an export.
- No tests yet. Verification so far is the build, the linter and the browser run above.

---

## Next milestone — data layer (milestone 2)

Suggested order, each step leaving the app runnable:

1. `docker compose` (or a local Postgres) + `DATABASE_URL`; run the draft `prisma/schema.prisma`
   as the first migration. Confirm the constraints listed in it exist.
2. Seed script replacing `client/src/mock/data.ts` with the same people and events.
3. Real endpoints in this order: events (list/create/read) → registrations → check-ins.
   Registration inside a transaction that enforces capacity; check-in relying on the unique
   constraint and translating the violation into `already_checked_in` with the original time.
4. Point `AppStore` at the API, one action at a time, and delete the mock file when the last one
   moves. The interface in `store/context.ts` should not need to change.
5. Concurrency proof: a script firing 100+ simultaneous registrations and duplicate check-ins at
   two server processes sharing one database, with the output committed under `docs/`.

Then: auth (milestone 3), QR tokens + real scanning (4), offline sync + Socket.IO (5),
AI insights + CSV export (6).

---

## Milestone 2 — real core application ✅ (2026-08-20)

Replaced every mocked flow with a database-backed one: PostgreSQL + Prisma, bcrypt/JWT-cookie
authentication, server-enforced roles and ownership, transactional registration, opaque QR tokens
with real generation and camera scanning, constraint-backed check-in, live dashboard numbers and
CSV export. `client/src/mock/data.ts` was deleted.

Added 39 integration tests against a real database, including two concurrency cases.

Full detail, verification log, known limitations and the next milestone:
[CHECKPOINT.md](../CHECKPOINT.md).

Two bugs found and fixed while verifying:

- an already-registered attendee on a full event was told "event full", because the capacity check
  ran before the duplicate check;
- `NODE_ENV=development` in the shared `.env` made Vite ship a **development** React build (474 kB,
  dev warnings). `NODE_ENV` now comes from the process only.
