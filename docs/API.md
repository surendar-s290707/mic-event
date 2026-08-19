# API

Base path `/api`. Everything returns JSON, including errors:
`{ "error": "<code>", "message": "<human readable>" }`.

## Implemented

### `GET /api/health`

```json
{
  "status": "ok",
  "service": "mic-event-api",
  "message": "MIC Event API is running",
  "version": "0.1.0",
  "environment": "development",
  "uptimeSeconds": 12,
  "timestamp": "2026-08-19T18:35:39.050Z"
}
```

Used by the client's status pill. A database ping will be added when there is a database.

## Planned

Not built yet — listed so the routing layout and the client's store interface stay aligned.
Nothing below is stubbed in the code; an endpoint that exists but does nothing is worse than one
that does not exist.

| Method | Path                              | Role      | Purpose                                  |
| ------ | --------------------------------- | --------- | ---------------------------------------- |
| POST   | `/api/auth/register`              | public    | create an account                        |
| POST   | `/api/auth/login`                 | public    | email + password, returns a token        |
| GET    | `/api/auth/me`                    | any       | current user                             |
| GET    | `/api/events`                     | any       | list events                              |
| POST   | `/api/events`                     | organizer | create an event                          |
| GET    | `/api/events/:id`                 | any       | one event with counts                    |
| POST   | `/api/events/:id/registrations`   | attendee  | register — capacity enforced in a tx     |
| GET    | `/api/events/:id/registrations`   | organizer | attendee list                            |
| GET    | `/api/registrations/:id/ticket`   | owner     | current signed QR token                  |
| POST   | `/api/check-ins`                  | organizer | scan a token; duplicates rejected by DB  |
| POST   | `/api/check-ins/sync`             | organizer | replay offline scans, idempotent         |
| GET    | `/api/events/:id/stats`           | organizer | live counts for the dashboard            |
| GET    | `/api/events/:id/export.csv`      | organizer | attendee list + check-in timestamps      |
| POST   | `/api/events/:id/insights`        | organizer | natural-language question over real data |
