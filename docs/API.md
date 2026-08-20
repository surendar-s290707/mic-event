# API reference

Base path `/api`. All responses are JSON unless noted.

**Session** — a signed JWT in an HTTP-only cookie (`mic_session`), set by signup and login. Browsers
send it automatically; `fetch` needs `credentials: 'include'`.

**Errors** — every deliberate failure looks the same:

```json
{ "error": "forbidden", "message": "That event belongs to another organizer.", "details": null }
```

`details` carries field messages on validation failures: `{ "capacity": "Capacity must be above 0" }`.

| Status | When                                                        |
| ------ | ----------------------------------------------------------- |
| 400    | validation failed (`details` says which fields)             |
| 401    | no session, or it expired / was tampered with               |
| 403    | wrong role, or the event belongs to another organizer       |
| 404    | no such event, ticket, or route — also used for "not yours" |
| 409    | duplicate email, duplicate registration, event full         |
| 500    | a bug; the message is deliberately vague                    |

---

## Health

### `GET /api/health`
Public. Includes a database round-trip; returns 503 with `database: "down"` if PostgreSQL is
unreachable, which is what the client's status pill reflects.

---

## Auth

### `POST /api/auth/signup`
`{ name, email, password (8+), role: "ORGANIZER" | "ATTENDEE" }` → `201 { user }` and a session
cookie. `409 email_taken` if the address is in use.

### `POST /api/auth/login`
`{ email, password }` → `200 { user }` and a session cookie. An unknown email and a wrong password
return the identical 401, so the endpoint cannot be used to find out who has an account.

### `POST /api/auth/logout`
Clears the cookie. Safe to call when signed out.

### `GET /api/auth/me`
`200 { user }` or `401`. The user row is re-read on every authenticated request, so a deleted or
role-changed account stops working immediately rather than at token expiry.

A `user` never includes `passwordHash`.

---

## Events

All event routes require a session.

### `GET /api/events`
Role-scoped:
- **Organizer** — their own events, including `checkedInCount`.
- **Attendee** — every event that has not finished, including `myRegistration` (or `null`), and
  **without** `checkedInCount`.

### `POST /api/events` — organizer only
`{ name (3+), description?, venue, startsAt (ISO), endsAt (ISO), capacity (positive int) }`
→ `201 { event }`. The creator becomes the owner. `endsAt` must be after `startsAt`.

### `GET /api/events/:eventId`
One event, shaped by who is asking, exactly as in the list.

### `POST /api/events/:eventId/register` — attendee only
→ `201 { ticket }` with the QR token.

Runs in a transaction that locks the event row (`SELECT … FOR UPDATE`) before counting registrations,
so capacity is decided by the database. A unique index on `(eventId, userId)` is the backstop.

| Failure                | Response                    |
| ---------------------- | --------------------------- |
| Already registered     | `409 already_registered`    |
| No seats left          | `409 event_full`            |
| Event already finished | `409 registration_closed`   |
| No such event          | `404 not_found`             |

### `GET /api/events/:eventId/registration` — attendee only
The caller's own ticket for that event, or `404` if they have not registered.

### `POST /api/events/:eventId/check-in` — organizer who owns the event
`{ token, stationId? }`

The four scan verdicts come back with **HTTP 200** — the request itself succeeded, and the verdict
belongs to the ticket. Authentication and ownership failures are still 401/403, and an empty token is
still a 400.

```json
{ "success": true,  "message": "Checked in successfully", "attendee": { "name": "…" }, "checkedInAt": "…" }
{ "success": false, "reason": "ALREADY_CHECKED_IN", "attendee": { "name": "…" }, "checkedInAt": "<original scan>" }
{ "success": false, "reason": "INVALID_TICKET" }
{ "success": false, "reason": "WRONG_EVENT", "attendee": { "name": "…" } }
```

The insert is attempted first and a unique-constraint violation on `CheckIn.registrationId` becomes
`ALREADY_CHECKED_IN`. A read-then-write check would let two simultaneous scans both pass the read.

### `GET /api/events/:eventId/stats` — owner only
`{ stats: { capacity, registeredCount, checkedInCount, spotsLeft, attendancePercent },
   recentCheckIns: [{ id, name, checkedInAt, stationId }],
   arrivals: [ISO timestamps from the last two hours] }`

### `GET /api/events/:eventId/export.csv` — owner only
`text/csv` attachment: Name, Email, Registered at, Check-in status, Checked in at.

---

## Registrations

### `GET /api/registrations/:id`
One ticket by registration id, including its QR token. Readable **only** by the attendee it belongs
to; anyone else gets `404` (not `403`), so ids cannot be probed.

---

## Not built yet

Offline scan sync, AI insights (`POST /api/events/:id/insights`), and Socket.IO live updates. The
dashboard currently polls `/stats` every 10 seconds.
