# MIC Event

Event check-in for campus clubs. An organizer creates an event, attendees register and get their
own QR ticket, organizers scan people in at the door, and a dashboard shows who is inside.

Built for the MIC Development Department Stage 2 task.

---

## Status: milestone 1 — UI foundation and basic flow

What works today, on **mock data held in the browser**:

- landing page, mock login with an organizer / attendee role selector
- organizer: dashboard, event list, create event (validated), scanner screen, live event dashboard
- attendee: dashboard, event browser with registration, QR ticket page
- role-aware routing, plus every loading / empty / error state
- a real backend with `GET /api/health`, which the UI polls for its status pill

What is **not** built yet — and is deliberately not faked anywhere in the code:

- PostgreSQL, Prisma and real persistence (state resets on reload)
- real authentication, password hashing, tokens, server-side authorization
- secure QR tokens, real camera scanning, database-enforced duplicate/capacity rules
- offline scan queue and sync, Socket.IO live updates, AI insights, CSV export

See [docs/PROGRESS.md](docs/PROGRESS.md) for the checkpoint log and the next milestone, and
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the current mock layer is meant to be replaced.

---

## Stack

| Layer    | Choice                                   |
| -------- | ---------------------------------------- |
| Frontend | React 18, TypeScript, Vite, React Router |
| Styling  | Plain CSS with design tokens, no framework |
| Backend  | Node, Express, TypeScript                |
| Planned  | PostgreSQL + Prisma, Socket.IO, qrcode, html5-qrcode |

The repository is one npm workspace with two packages: `client/` and `server/`.

---

## Running it

Requires Node 20 or newer.

```bash
npm install
cp .env.example .env
npm start
```

`npm start` runs the API on <http://localhost:4000> and the client on <http://localhost:5173>.
The status pill in the header turns green once the browser can reach `/api/health`.

Log in with the demo accounts shown on the login page:

| Role      | Email                   | Password  |
| --------- | ----------------------- | --------- |
| Organizer | `aditi@mic.dev`         | `mic1234` |
| Attendee  | `sneha@student.mic.dev` | `mic1234` |

### Scripts

| Command              | What it does                                      |
| -------------------- | ------------------------------------------------- |
| `npm start`          | API and client together                           |
| `npm run dev`        | client only (Vite, port 5173)                     |
| `npm run server`     | API only (tsx watch, port 4000)                   |
| `npm run build`      | type-check and build both packages                |
| `npm run start:prod` | run the built API (serves the built client too)   |
| `npm run lint`       | ESLint over client and server                     |
| `npm run typecheck`  | TypeScript with no emit, both packages            |

---

## Project layout

```
client/        React app
  src/
    components/   app shell, UI primitives, shared pieces
    routes/       one file per screen (organizer/, attendee/)
    store/        app state + the interface the API will implement
    mock/         all development data, in one file
    lib/          types, formatting, API client
    styles/       design tokens and CSS
server/        Express API
  src/routes/   /api/health today; auth, events, check-ins later
prisma/        draft schema — not migrated yet
docs/          architecture, API plan, progress log
```

---

## Configuration

All configuration is environment variables; see [`.env.example`](.env.example). Nothing is
hard-coded to a machine and no secrets are committed.

| Variable             | Used by | Meaning                                                     |
| -------------------- | ------- | ----------------------------------------------------------- |
| `PORT`               | server  | API port (default 4000)                                     |
| `NODE_ENV`           | server  | `production` also serves the built client from the API      |
| `CORS_ORIGIN`        | server  | comma-separated allowed origins; unset means reflect origin |
| `VITE_API_BASE_URL`  | client  | API origin in production; unset in dev (Vite proxies `/api`)|
| `VITE_DEV_API_TARGET`| client  | dev proxy target, only if the API is not on port 4000       |

---

## Deploying

The build produces a static client (`client/dist`) and a compiled API (`server/dist`).

**One service (simplest).** Build both, then run the API with `NODE_ENV=production`: it serves
`client/dist` and falls back to `index.html` for client routes, so the whole app is one origin.

```bash
npm install && npm run build
NODE_ENV=production PORT=4000 npm run start:prod
```

**Two services.** Host `client/dist` on any static host with `VITE_API_BASE_URL` pointing at the
API, and run the API separately with `CORS_ORIGIN` set to the client's origin.
