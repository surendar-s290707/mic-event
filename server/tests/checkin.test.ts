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

describe('check-in', () => {
  let server: TestServer;

  before(async () => {
    server = await startTestServer();
  });
  after(async () => {
    await server.close();
    await disconnect();
  });
  beforeEach(resetDatabase);

  /** An organizer with an event, and one attendee holding a ticket for it. */
  async function scenario(capacity = 10) {
    const organizer = createClient(server.baseUrl);
    await signUp(organizer, 'ORGANIZER');
    const event = await createEvent(organizer, { capacity });

    const attendee = createClient(server.baseUrl);
    const account = await signUp(attendee, 'ATTENDEE');
    const registration = await attendee.post(`/api/events/${event.id}/register`);

    return { organizer, attendee, account, event, ticket: registration.body.ticket };
  }

  it('checks a valid ticket in', async () => {
    const { organizer, event, ticket, account } = await scenario();

    const response = await organizer.post(`/api/events/${event.id}/check-in`, {
      token: ticket.qrToken,
      stationId: 'door-a',
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.attendee.name, account.name);
    assert.ok(response.body.checkedInAt);
  });

  it('rejects the same ticket the second time, with the original timestamp', async () => {
    const { organizer, event, ticket } = await scenario();

    const first = await organizer.post(`/api/events/${event.id}/check-in`, { token: ticket.qrToken });
    const second = await organizer.post(`/api/events/${event.id}/check-in`, { token: ticket.qrToken });

    assert.equal(second.body.success, false);
    assert.equal(second.body.reason, 'ALREADY_CHECKED_IN');
    assert.equal(
      second.body.checkedInAt,
      first.body.checkedInAt,
      'the reported time is the original scan, not now',
    );
  });

  it('rejects a token nobody issued', async () => {
    const { organizer, event } = await scenario();

    const response = await organizer.post(`/api/events/${event.id}/check-in`, {
      token: 'this-token-was-never-issued',
    });

    assert.equal(response.body.success, false);
    assert.equal(response.body.reason, 'INVALID_TICKET');
  });

  it('rejects a ticket issued for a different event', async () => {
    const { organizer, ticket } = await scenario();
    // Same organizer, second event: the ticket is real but belongs elsewhere.
    const otherEvent = await createEvent(organizer, { name: 'Another Event' });

    const response = await organizer.post(`/api/events/${otherEvent.id}/check-in`, {
      token: ticket.qrToken,
    });

    assert.equal(response.body.success, false);
    assert.equal(response.body.reason, 'WRONG_EVENT');
  });

  it('rejects an empty token as bad input, not as a scan verdict', async () => {
    const { organizer, event } = await scenario();

    const response = await organizer.post(`/api/events/${event.id}/check-in`, { token: '   ' });
    assert.equal(response.status, 400);
  });

  it('records exactly one check-in when the same ticket is scanned many times at once', async () => {
    const { organizer, event, ticket } = await scenario();

    // Twelve scanners hitting the same ticket in the same instant.
    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        organizer.post(`/api/events/${event.id}/check-in`, { token: ticket.qrToken }),
      ),
    );

    const succeeded = results.filter((r) => r.body.success === true);
    const duplicates = results.filter((r) => r.body.reason === 'ALREADY_CHECKED_IN');

    assert.equal(succeeded.length, 1, 'exactly one scan wins');
    assert.equal(duplicates.length, 11, 'the rest are cleanly rejected');

    const { prisma } = await import('../src/lib/prisma.js');
    const rows = await prisma.checkIn.count({ where: { registration: { eventId: event.id } } });
    assert.equal(rows, 1, 'and the database holds a single check-in row');
  });

  it('shows the attendee their new status', async () => {
    const { organizer, attendee, event, ticket } = await scenario();

    const before = await attendee.get(`/api/events/${event.id}/registration`);
    assert.equal(before.body.ticket.checkedIn, false);

    await organizer.post(`/api/events/${event.id}/check-in`, { token: ticket.qrToken });

    const after = await attendee.get(`/api/events/${event.id}/registration`);
    assert.equal(after.body.ticket.checkedIn, true);
    assert.ok(after.body.ticket.checkedInAt);
  });

  it('counts the check-in on the organizer dashboard', async () => {
    const { organizer, event, ticket } = await scenario();

    await organizer.post(`/api/events/${event.id}/check-in`, { token: ticket.qrToken });

    const stats = await organizer.get(`/api/events/${event.id}/stats`);
    assert.equal(stats.body.stats.registeredCount, 1);
    assert.equal(stats.body.stats.checkedInCount, 1);
    assert.equal(stats.body.stats.attendancePercent, 100);
    assert.equal(stats.body.recentCheckIns.length, 1);
  });

  it('exports attendance as CSV for the owning organizer only', async () => {
    const { organizer, event, ticket, account } = await scenario();
    await organizer.post(`/api/events/${event.id}/check-in`, { token: ticket.qrToken });

    const response = await organizer.get(`/api/events/${event.id}/export.csv`);
    assert.equal(response.status, 200);

    const csv = String(response.body);
    const [header, row] = csv.trim().split('\r\n');
    assert.equal(header, '"Name","Email","Registered at","Check-in status","Checked in at"');
    assert.ok(row.includes(account.name));
    assert.ok(row.includes(account.email));
    assert.ok(row.includes('Checked in'));
    // No other event's attendees leaked in.
    assert.equal(csv.trim().split('\r\n').length, 2);
  });
});
