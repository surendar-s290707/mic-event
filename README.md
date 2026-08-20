# MIC Event

Event check-in for campus clubs. An organizer creates an event, attendees register and get their own
QR ticket, organizers scan people in at the door, and the dashboard shows who is inside.

Built for the MIC Development Department Stage 2 task.

---

## What works today

A real, database-backed application:

- **Accounts** — signup, login, logout, session check. Passwords are bcrypt hashes; the session is a
  signed JWT in an HTTP-only cookie.
- **Roles enforced on the server** — organizers create and run events, attendees register and hold
  tickets. Calling an organizer endpoint as an attendee fails with 403 no matter what the frontend
  shows, and an organizer cannot touch another organizer's event.
- **Events** — created with real validation, owned by their creator, listed per role.
- **Registration** — one seat per person, capacity enforced inside a database transaction.
- **Unique QR per registration** — the code holds a 32-byte random token and nothing else.
- **Camera scanning** — `html5-qrcode` on the organizer's phone or laptop, with a typed-code fallback.
- **Check-in** — four clear verdicts (checked in, already checked in, invalid ticket, wrong event).
  A duplicate is caught by a unique constraint, not an `if`, so simultaneous scans cannot both win.
- **Dashboard** — live counts, recent check-ins and arrival times, refreshed every 10 seconds.
- **CSV export** — name, email, registration time, check-in status and timestamp, for your own event.

Not built yet: offline scanning and sync, AI insights, Socket.IO live updates, and the standalone
100+ concurrent-request proof script. See [CHECKPOINT.md](CHECKPOINT.md).

---

## Stack

| Layer    | Choice                                          |
| -------- | ----------------------------------------------- |
| Frontend | React 18, TypeScript, Vite, React Router         |
| Styling  | Plain CSS with design tokens, no framework       |
| Backend  | Node, Express, TypeScript                        |
| Database | PostgreSQL 16 with Prisma                        |
| QR       | `qrcode` to render, `html5-qrcode` to scan       |
| Tests    | `node --test` against a real database            |

One npm workspace, two packages: `client/` and `server/`.

---

## Running it

Requires **Node 20+** and **Docker** (for the local database — any PostgreSQL 14+ works if you
already have one).

```bash
npm install
cp .env.example .env
npm run db:up
npm run db:migrate
npm run db:seed
npm start
```

`npm start` runs the API on <http://localhost:4000> and the client on <http://localhost:5173>. The
status pill in the header turns green when the browser can reach the API *and* the API can reach the
database.

Seeded demo accounts — password `mic12345` for all of them:

| Role      | Email                   |
| --------- | ----------------------- |
| Organizer | `aditi@mic.dev`         |
| Organizer | `rahul@mic.dev`         |
| Attendee  | `sneha@student.mic.dev` |
| Attendee  | `karthik@student.mic.dev` |

Or create your own account at `/signup`.

> Scanning with a camera needs a secure context. `localhost` counts, so the laptop webcam works in
> development. To scan from a phone you need HTTPS (or a tunnel) — the typed-code fallback on the
> scanner screen works anywhere.

### Scripts

| Command              | What it does                                            |
| -------------------- | ------------------------------------------------------- |
| `npm start`          | API and client together                                 |
| `npm run dev`        | client only (Vite, port 5173)                           |
| `npm run server`     | API only (tsx watch, port 4000)                         |
| `npm run build`      | type-check and build both packages                      |
| `npm run start:prod` | run the built API with `NODE_ENV=production`            |
| `npm test`           | integration suite against `TEST_DATABASE_URL`           |
| `npm run proof:concurrency` | two API processes, one database, 120+ simultaneous requests |
| `npm run lint`       | ESLint over client, server and tests                    |
| `npm run typecheck`  | TypeScript, no emit, both packages                      |
| `npm run db:up`      | start PostgreSQL in Docker                              |
| `npm run db:down`    | stop it (data survives; `docker compose down -v` wipes) |
| `npm run db:migrate` | create and apply a migration (development)              |
| `npm run db:deploy`  | apply existing migrations (production)                  |
| `npm run db:seed`    | load demo data — **deletes all rows first**             |
| `npm run db:studio`  | browse the database in Prisma Studio                    |

---

## Project layout

```
client/        React app
  src/
    components/   app shell, UI primitives, QR, scan result
    routes/       one file per screen (organizer/, attendee/)
    store/        session provider (who is signed in)
    lib/          API client, types, formatting, useAsync
    styles/       design tokens and CSS
server/        Express API
  src/
    routes/       health, auth, events, registrations
    middleware/   requireAuth, requireRole
    lib/          prisma client, auth, errors, validation, serializers, csv
  tests/        integration tests
prisma/        schema, migrations, seed
docs/          architecture, API reference, progress log
```

---

## Configuration

Every setting is an environment variable; see [`.env.example`](.env.example). Nothing is hard-coded
to a machine and no secrets are committed.

| Variable              | Required | Meaning                                                        |
| --------------------- | -------- | -------------------------------------------------------------- |
| `DATABASE_URL`        | yes      | PostgreSQL connection string                                    |
| `JWT_SECRET`          | yes      | signs session cookies (`openssl rand -hex 32`)                  |
| `PORT`                | no       | API port, default 4000                                          |
| `SESSION_TTL_DAYS`    | no       | session lifetime, default 7                                     |
| `CORS_ORIGIN`         | no       | allowed browser origins; unset reflects the request origin      |
| `TEST_DATABASE_URL`   | for tests| separate database the suite wipes                               |
| `VITE_API_BASE_URL`   | no       | API origin in production, when the client is hosted separately  |
| `VITE_DEV_API_TARGET` | no       | dev proxy target, if the API is not on port 4000                |

`NODE_ENV` is set by the process, **not** in `.env` — Vite reads the same file, and
`NODE_ENV=development` there would ship a development React build.

The API fails at startup with a clear message if `DATABASE_URL` or `JWT_SECRET` is missing.

---

## Deploying

```bash
npm install
npm run db:deploy      # apply migrations to the production database
npm run build          # server -> server/dist, client -> client/dist
NODE_ENV=production PORT=4000 npm run start:prod
```

**One service (simplest).** With `NODE_ENV=production` the API serves `client/dist` and falls back to
`index.html` for client routes, so the whole app is one origin — no CORS, one deploy.

**Two services.** Host `client/dist` on a static host with `VITE_API_BASE_URL` pointing at the API,
and run the API with `CORS_ORIGIN` set to the client's origin. Cookies are `SameSite=Lax` and
`Secure` in production, so both must be served over HTTPS.
