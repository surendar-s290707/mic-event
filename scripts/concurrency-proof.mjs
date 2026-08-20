/**
 * ===========================================================================
 * Concurrency proof
 * ===========================================================================
 * Starts TWO independent API processes on different ports, both pointed at the
 * SAME PostgreSQL database, then hammers them simultaneously:
 *
 *   1. 120 attendees register for a 25-seat event at the same instant,
 *      alternating between the two processes.  Exactly 25 must get in.
 *   2. 60 scanners check in the SAME ticket at the same instant, split across
 *      both processes.  Exactly one must succeed.
 *   3. All 25 tickets are scanned twice over, concurrently, across both
 *      processes.  Exactly 25 check-ins must exist.
 *
 * Two processes is the point: an in-memory lock or a JavaScript counter would
 * pass this on one process and fail here. Correctness has to come from the
 * database — a row lock inside the registration transaction, and unique
 * indexes on (eventId, userId) and CheckIn.registrationId.
 *
 *   npm run proof:concurrency
 *
 * The output is written to docs/concurrency-proof.log.
 */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const PORTS = [4101, 4102];
const CAPACITY = 25;
const REGISTRATIONS = 120;
const DUPLICATE_SCANS = 60;

const lines = [];
const log = (text = '') => {
  console.log(text);
  lines.push(text);
};

const prisma = new PrismaClient();
const stamp = Date.now();
const servers = [];

function startServer(port) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['server/dist/index.js'], {
      env: { ...process.env, PORT: String(port), NODE_ENV: 'production' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stderr.on('data', (chunk) => process.stderr.write(`[:${port}] ${chunk}`));
    servers.push(child);

    const deadline = Date.now() + 20_000;
    const poll = async () => {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/health`);
        if (res.ok) return resolve(child);
      } catch {
        /* not up yet */
      }
      if (Date.now() > deadline) return reject(new Error(`server on ${port} never became healthy`));
      setTimeout(poll, 200);
    };
    poll();
  });
}

async function call(port, path, { method = 'GET', body, cookie } = {}) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const cookies = res.headers.getSetCookie();
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return {
    status: res.status,
    body: parsed,
    cookie: cookies.length ? cookies.map((c) => c.split(';')[0]).join('; ') : undefined,
  };
}

/** Round-robin so the load genuinely lands on both processes. */
const portFor = (index) => PORTS[index % PORTS.length];

async function main() {
  log('='.repeat(78));
  log('MIC Event — concurrency proof');
  log(`run at ${new Date().toISOString()}`);
  log('='.repeat(78));
  log();

  log('Starting two API processes against one database…');
  await Promise.all(PORTS.map(startServer));
  const dbName = new URL(process.env.DATABASE_URL).pathname.slice(1);
  for (const port of PORTS) log(`  process on port ${port} → database "${dbName}"`);
  log();

  // --- setup ---------------------------------------------------------------
  const organizer = await call(PORTS[0], '/api/auth/signup', {
    method: 'POST',
    body: {
      name: 'Proof Organizer',
      email: `proof.org.${stamp}@mic.dev`,
      password: 'proofpassword1',
      role: 'ORGANIZER',
    },
  });
  const organizerCookie = organizer.cookie;

  const event = await call(PORTS[0], '/api/events', {
    method: 'POST',
    cookie: organizerCookie,
    body: {
      name: `Concurrency Proof ${stamp}`,
      description: 'Load test event.',
      venue: 'Proof Hall',
      startsAt: new Date(Date.now() + 3600_000).toISOString(),
      endsAt: new Date(Date.now() + 7200_000).toISOString(),
      capacity: CAPACITY,
    },
  });
  const eventId = event.body.event.id;
  log(`Event created with capacity ${CAPACITY} (id ${eventId})`);

  log(`Creating ${REGISTRATIONS} attendee accounts…`);
  const attendees = await Promise.all(
    Array.from({ length: REGISTRATIONS }, async (_, i) => {
      const res = await call(portFor(i), '/api/auth/signup', {
        method: 'POST',
        body: {
          name: `Proof Attendee ${i}`,
          email: `proof.att.${i}.${stamp}@student.mic.dev`,
          password: 'proofpassword1',
          role: 'ATTENDEE',
        },
      });
      return res.cookie;
    }),
  );
  log('done.');
  log();

  // --- 1. registration under load -----------------------------------------
  log('-'.repeat(78));
  log(`TEST 1  ${REGISTRATIONS} simultaneous registrations for ${CAPACITY} seats`);
  log('-'.repeat(78));

  const startedAt = Date.now();
  const registrations = await Promise.all(
    attendees.map((cookie, i) =>
      call(portFor(i), `/api/events/${eventId}/register`, { method: 'POST', cookie }),
    ),
  );
  const elapsed = Date.now() - startedAt;

  const created = registrations.filter((r) => r.status === 201);
  const full = registrations.filter((r) => r.body?.error === 'event_full');
  const other = registrations.filter((r) => r.status !== 201 && r.body?.error !== 'event_full');
  const rowsInDb = await prisma.registration.count({ where: { eventId } });

  log(`  requests fired      : ${REGISTRATIONS} (split across ports ${PORTS.join(' and ')})`);
  log(`  wall clock          : ${elapsed} ms`);
  log(`  HTTP 201 created    : ${created.length}`);
  log(`  409 event_full      : ${full.length}`);
  log(`  unexpected responses: ${other.length}${other.length ? ' ' + JSON.stringify(other.slice(0, 3)) : ''}`);
  log(`  rows in database    : ${rowsInDb}`);
  const test1 =
    created.length === CAPACITY && rowsInDb === CAPACITY && other.length === 0 &&
    full.length === REGISTRATIONS - CAPACITY;
  log(`  RESULT              : ${test1 ? 'PASS' : 'FAIL'} — capacity ${CAPACITY} never exceeded`);
  log();

  // --- 2. duplicate check-in ----------------------------------------------
  log('-'.repeat(78));
  log(`TEST 2  ${DUPLICATE_SCANS} simultaneous scans of ONE ticket`);
  log('-'.repeat(78));

  const firstTicket = created[0].body.ticket;
  const scanStart = Date.now();
  const scans = await Promise.all(
    Array.from({ length: DUPLICATE_SCANS }, (_, i) =>
      call(portFor(i), `/api/events/${eventId}/check-in`, {
        method: 'POST',
        cookie: organizerCookie,
        body: { token: firstTicket.qrPayload, stationId: `proof-${portFor(i)}` },
      }),
    ),
  );
  const scanElapsed = Date.now() - scanStart;

  const accepted = scans.filter((s) => s.body?.success === true);
  const duplicates = scans.filter((s) => s.body?.reason === 'ALREADY_CHECKED_IN');
  const strange = scans.filter(
    (s) => s.body?.success !== true && s.body?.reason !== 'ALREADY_CHECKED_IN',
  );
  const checkInRows = await prisma.checkIn.count({
    where: { registrationId: firstTicket.id },
  });

  log(`  scans fired         : ${DUPLICATE_SCANS} (split across both processes)`);
  log(`  wall clock          : ${scanElapsed} ms`);
  log(`  succeeded           : ${accepted.length}`);
  log(`  ALREADY_CHECKED_IN  : ${duplicates.length}`);
  log(`  unexpected responses: ${strange.length}${strange.length ? ' ' + JSON.stringify(strange.slice(0, 3)) : ''}`);
  log(`  check-in rows       : ${checkInRows}`);
  const test2 = accepted.length === 1 && checkInRows === 1 && strange.length === 0;
  log(`  RESULT              : ${test2 ? 'PASS' : 'FAIL'} — exactly one check-in`);
  log();

  // --- 3. every ticket scanned twice, all at once --------------------------
  log('-'.repeat(78));
  log(`TEST 3  all ${CAPACITY} tickets scanned twice over, concurrently`);
  log('-'.repeat(78));

  const everyTicketTwice = created.flatMap((r, i) => [
    { ticket: r.body.ticket, port: portFor(i) },
    { ticket: r.body.ticket, port: portFor(i + 1) }, // the other process
  ]);
  const allScans = await Promise.all(
    everyTicketTwice.map(({ ticket, port }) =>
      call(port, `/api/events/${eventId}/check-in`, {
        method: 'POST',
        cookie: organizerCookie,
        body: { token: ticket.qrPayload, stationId: `proof-${port}` },
      }),
    ),
  );
  const totalCheckIns = await prisma.checkIn.count({ where: { registration: { eventId } } });
  const succeeded = allScans.filter((s) => s.body?.success === true).length;

  log(`  scans fired         : ${everyTicketTwice.length}`);
  log(`  succeeded           : ${succeeded}`);
  log(`  check-in rows       : ${totalCheckIns} (one per registration, max ${CAPACITY})`);
  const test3 = totalCheckIns === CAPACITY;
  log(`  RESULT              : ${test3 ? 'PASS' : 'FAIL'} — one check-in per registration`);
  log();

  // --- cleanup -------------------------------------------------------------
  await prisma.event.deleteMany({ where: { id: eventId } });
  await prisma.user.deleteMany({ where: { email: { contains: `.${stamp}@` } } });

  log('='.repeat(78));
  const allPassed = test1 && test2 && test3;
  log(`OVERALL: ${allPassed ? 'PASS' : 'FAIL'}`);
  log('='.repeat(78));

  mkdirSync('docs', { recursive: true });
  writeFileSync('docs/concurrency-proof.log', lines.join('\n') + '\n');
  console.log('\nWritten to docs/concurrency-proof.log');

  return allPassed;
}

let passed = false;
try {
  passed = await main();
} catch (error) {
  console.error(error);
} finally {
  for (const child of servers) child.kill('SIGTERM');
  await prisma.$disconnect();
}
process.exit(passed ? 0 : 1);
