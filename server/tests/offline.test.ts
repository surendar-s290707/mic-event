import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createClient,
  createEvent,
  disconnect,
  resetDatabase,
  signUp,
  startTestServer,
  type TestServer,
} from './helpers.js';

/**
 * Offline scanning: a device queues scans without a connection and replays them
 * later. The rules being tested are in server/src/lib/checkin.ts.
 */
describe('offline scan sync', () => {
  let server: TestServer;

  before(async () => {
    server = await startTestServer();
  });
  after(async () => {
    await server.close();
    await disconnect();
  });
  beforeEach(resetDatabase);

  async function scenario(attendees = 1) {
    const organizer = createClient(server.baseUrl);
    await signUp(organizer, 'ORGANIZER');
    const event = await createEvent(organizer, { capacity: 20 });

    const tickets = [];
    for (let i = 0; i < attendees; i += 1) {
      const attendee = createClient(server.baseUrl);
      const account = await signUp(attendee, 'ATTENDEE');
      const registration = await attendee.post(`/api/events/${event.id}/register`);
      tickets.push({ attendee, account, ticket: registration.body.ticket });
    }
    return { organizer, event, tickets };
  }

  const scan = (token: string, clientScanId: string, minutesAgo = 0, stationId = 'station-a') => ({
    clientScanId,
    token,
    scannedAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
    stationId,
  });

  it('checks a queued scan in when it syncs', async () => {
    const { organizer, event, tickets } = await scenario();

    const response = await organizer.post(`/api/events/${event.id}/check-in/sync`, {
      scans: [scan(tickets[0].ticket.qrToken, 'scan-offline-0001', 5)],
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.results.length, 1);
    assert.equal(response.body.results[0].success, true);
    assert.equal(response.body.results[0].clientScanId, 'scan-offline-0001');
  });

  it('keeps the time the scan happened, not the time it synced', async () => {
    const { organizer, event, tickets } = await scenario();

    await organizer.post(`/api/events/${event.id}/check-in/sync`, {
      scans: [scan(tickets[0].ticket.qrToken, 'scan-offline-0002', 30)],
    });

    const stats = await organizer.get(`/api/events/${event.id}/stats`);
    const recorded = new Date(stats.body.recentCheckIns[0].checkedInAt).getTime();
    const thirtyMinutesAgo = Date.now() - 30 * 60_000;
    assert.ok(
      Math.abs(recorded - thirtyMinutesAgo) < 60_000,
      'check-in is stamped ~30 minutes ago, when the door scan actually happened',
    );
  });

  it('never creates two check-ins when the same queue is replayed', async () => {
    const { organizer, event, tickets } = await scenario();
    const batch = { scans: [scan(tickets[0].ticket.qrToken, 'scan-offline-0003', 5)] };

    const first = await organizer.post(`/api/events/${event.id}/check-in/sync`, batch);
    const second = await organizer.post(`/api/events/${event.id}/check-in/sync`, batch);
    const third = await organizer.post(`/api/events/${event.id}/check-in/sync`, batch);

    assert.equal(first.body.results[0].success, true);
    // A replay reports success too — the scan did land — but writes nothing new.
    assert.equal(second.body.results[0].reason, 'ALREADY_SYNCED');
    assert.equal(third.body.results[0].reason, 'ALREADY_SYNCED');
    assert.equal(second.body.results[0].checkedInAt, first.body.results[0].checkedInAt);

    const { prisma } = await import('../src/lib/prisma.js');
    assert.equal(await prisma.checkIn.count({ where: { registration: { eventId: event.id } } }), 1);
  });

  it('stays at one check-in when the whole batch is replayed concurrently', async () => {
    const { organizer, event, tickets } = await scenario();
    const batch = { scans: [scan(tickets[0].ticket.qrToken, 'scan-offline-0004', 5)] };

    const responses = await Promise.all(
      Array.from({ length: 8 }, () => organizer.post(`/api/events/${event.id}/check-in/sync`, batch)),
    );

    for (const response of responses) {
      assert.equal(response.status, 200);
      const result = response.body.results[0];
      assert.ok(
        result.success === true || result.reason === 'ALREADY_CHECKED_IN',
        `unexpected verdict: ${JSON.stringify(result)}`,
      );
    }

    const { prisma } = await import('../src/lib/prisma.js');
    assert.equal(await prisma.checkIn.count({ where: { registration: { eventId: event.id } } }), 1);
  });

  /**
   * The case the brief asks about: scanned offline at station A, then online at
   * station B before A reconnects.
   */
  it('reports a duplicate — and corrects the time — when A syncs after B scanned online', async () => {
    const { organizer, event, tickets } = await scenario();
    const token = tickets[0].ticket.qrToken;

    // Station B scans online, now.
    const online = await organizer.post(`/api/events/${event.id}/check-in`, {
      token,
      stationId: 'station-b',
    });
    assert.equal(online.body.success, true);

    // Station A reconnects and syncs a scan it took 20 minutes earlier.
    const sync = await organizer.post(`/api/events/${event.id}/check-in/sync`, {
      scans: [scan(token, 'scan-offline-0005', 20, 'station-a')],
    });

    const result = sync.body.results[0];
    assert.equal(result.success, false);
    assert.equal(result.reason, 'ALREADY_CHECKED_IN', 'the scan is rejected, never silently dropped');
    assert.equal(result.reconciled, true, 'and the earlier door time wins');

    const corrected = new Date(result.checkedInAt).getTime();
    assert.ok(
      corrected < new Date(online.body.checkedInAt).getTime(),
      'stored time moved back to station A’s earlier scan',
    );

    const { prisma } = await import('../src/lib/prisma.js');
    assert.equal(
      await prisma.checkIn.count({ where: { registration: { eventId: event.id } } }),
      1,
      'still exactly one check-in',
    );
  });

  it('leaves the stored time alone when the queued scan is the later one', async () => {
    const { organizer, event, tickets } = await scenario();
    const token = tickets[0].ticket.qrToken;

    const online = await organizer.post(`/api/events/${event.id}/check-in`, { token });
    const sync = await organizer.post(`/api/events/${event.id}/check-in/sync`, {
      scans: [scan(token, 'scan-offline-0006', 0)],
    });

    assert.equal(sync.body.results[0].reason, 'ALREADY_CHECKED_IN');
    assert.notEqual(sync.body.results[0].reconciled, true);
    assert.equal(sync.body.results[0].checkedInAt, online.body.checkedInAt);
  });

  it('judges bad queued scans by the same rules as live ones', async () => {
    const { organizer, tickets } = await scenario();
    const otherEvent = await createEvent(organizer, { name: 'Somewhere Else' });

    const response = await organizer.post(`/api/events/${otherEvent.id}/check-in/sync`, {
      scans: [
        scan('never-issued-token', 'scan-offline-0007', 3),
        scan(tickets[0].ticket.qrToken, 'scan-offline-0008', 2),
      ],
    });

    assert.equal(response.body.results[0].reason, 'INVALID_TICKET');
    assert.equal(response.body.results[1].reason, 'WRONG_EVENT');
  });

  it('syncs a mixed batch and returns one result per scan, in order', async () => {
    const { organizer, event, tickets } = await scenario(3);
    const scans = [
      scan(tickets[0].ticket.qrToken, 'scan-batch-0001', 9),
      scan(tickets[1].ticket.qrToken, 'scan-batch-0002', 6),
      scan(tickets[1].ticket.qrToken, 'scan-batch-0003', 4), // same person twice
      scan(tickets[2].ticket.qrToken, 'scan-batch-0004', 2),
    ];

    const response = await organizer.post(`/api/events/${event.id}/check-in/sync`, { scans });
    const results = response.body.results;

    assert.equal(results.length, 4);
    assert.deepEqual(
      results.map((r: { clientScanId: string }) => r.clientScanId),
      scans.map((s) => s.clientScanId),
    );
    assert.equal(results[0].success, true);
    assert.equal(results[1].success, true);
    assert.equal(results[2].reason, 'ALREADY_CHECKED_IN', 'the duplicate inside the batch is caught');
    assert.equal(results[3].success, true);

    const { prisma } = await import('../src/lib/prisma.js');
    assert.equal(await prisma.checkIn.count({ where: { registration: { eventId: event.id } } }), 3);
  });

  it('ignores an implausible scan time from the device clock', async () => {
    const { organizer, event, tickets } = await scenario();

    const response = await organizer.post(`/api/events/${event.id}/check-in/sync`, {
      scans: [
        {
          clientScanId: 'scan-offline-0009',
          token: tickets[0].ticket.qrToken,
          scannedAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
          stationId: 'wrong-clock',
        },
      ],
    });

    assert.equal(response.body.results[0].success, true);
    const stored = new Date(response.body.results[0].checkedInAt).getTime();
    assert.ok(Math.abs(stored - Date.now()) < 60_000, 'server time used instead of the bad one');
  });

  it('still requires the organizer to own the event', async () => {
    const { event, tickets } = await scenario();

    const intruder = createClient(server.baseUrl);
    await signUp(intruder, 'ORGANIZER');
    const asOrganizer = await intruder.post(`/api/events/${event.id}/check-in/sync`, {
      scans: [scan(tickets[0].ticket.qrToken, 'scan-offline-0010', 1)],
    });
    assert.equal(asOrganizer.status, 403);

    const attendee = createClient(server.baseUrl);
    await signUp(attendee, 'ATTENDEE');
    const asAttendee = await attendee.post(`/api/events/${event.id}/check-in/sync`, {
      scans: [scan(tickets[0].ticket.qrToken, 'scan-offline-0011', 1)],
    });
    assert.equal(asAttendee.status, 403);
  });
});
