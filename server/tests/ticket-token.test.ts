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
 * Screenshot / sharing protection: the QR carries a token that expires, and
 * the registration's permanent secret never leaves the server.
 */
describe('rotating ticket tokens', () => {
  let server: TestServer;

  before(async () => {
    server = await startTestServer();
  });
  after(async () => {
    await server.close();
    await disconnect();
  });
  beforeEach(resetDatabase);

  async function scenario() {
    const organizer = createClient(server.baseUrl);
    await signUp(organizer, 'ORGANIZER');
    const event = await createEvent(organizer, { capacity: 10 });

    const attendee = createClient(server.baseUrl);
    const account = await signUp(attendee, 'ATTENDEE');
    const registration = await attendee.post(`/api/events/${event.id}/register`);

    return { organizer, attendee, account, event, ticket: registration.body.ticket };
  }

  it('never sends the permanent secret to the browser', async () => {
    const { attendee, ticket, event } = await scenario();

    const { prisma } = await import('../src/lib/prisma.js');
    const stored = await prisma.registration.findUniqueOrThrow({ where: { id: ticket.id } });

    for (const path of [`/api/registrations/${ticket.id}`, `/api/events/${event.id}/registration`]) {
      const body = JSON.stringify((await attendee.get(path)).body);
      assert.equal(body.includes(stored.qrToken), false, `${path} leaks the permanent token`);
      assert.equal(body.includes('"qrToken"'), false);
    }
  });

  it('issues a different token each time the ticket is opened', async () => {
    const { attendee, ticket } = await scenario();

    const first = (await attendee.get(`/api/registrations/${ticket.id}`)).body.ticket;
    await new Promise((resolve) => setTimeout(resolve, 1100)); // next second
    const second = (await attendee.get(`/api/registrations/${ticket.id}`)).body.ticket;

    assert.notEqual(first.qrPayload, second.qrPayload, 'a stale screenshot must not stay current');
    assert.ok(new Date(second.qrExpiresAt) > new Date(first.qrExpiresAt));
  });

  it('gives two attendees unrelated tokens', async () => {
    const { event, ticket } = await scenario();

    const other = createClient(server.baseUrl);
    await signUp(other, 'ATTENDEE');
    const otherTicket = (await other.post(`/api/events/${event.id}/register`)).body.ticket;

    assert.notEqual(ticket.qrPayload, otherTicket.qrPayload);
  });

  it('checks in a freshly issued token', async () => {
    const { organizer, event, ticket, account } = await scenario();

    const response = await organizer.post(`/api/events/${event.id}/check-in`, {
      token: ticket.qrPayload,
    });
    assert.equal(response.body.success, true);
    assert.equal(response.body.attendee.name, account.name);
  });

  it('refuses a token that has expired — the screenshot case', async () => {
    // A one-second life makes "this screenshot is stale" testable in real time.
    process.env.TICKET_TTL_SECONDS = '1';
    try {
      const { organizer, event, attendee, ticket } = await scenario();
      const fresh = (await attendee.get(`/api/registrations/${ticket.id}`)).body.ticket;

      // Comfortably past a 1s life, allowing for second-granularity rounding.
      await new Promise((resolve) => setTimeout(resolve, 2600));

      const response = await organizer.post(`/api/events/${event.id}/check-in`, {
        token: fresh.qrPayload,
      });

      assert.equal(response.body.success, false);
      assert.equal(response.body.reason, 'EXPIRED_TICKET');

      const { prisma } = await import('../src/lib/prisma.js');
      assert.equal(await prisma.checkIn.count(), 0, 'an expired code lets nobody in');
    } finally {
      delete process.env.TICKET_TTL_SECONDS;
    }
  });

  it('refuses a token whose expiry has been edited', async () => {
    const { organizer, event, ticket } = await scenario();

    const [prefix, registrationId, , signature] = ticket.qrPayload.split('.');
    const farFuture = Math.floor(Date.now() / 1000) + 86_400;
    const forged = [prefix, registrationId, farFuture, signature].join('.');

    const response = await organizer.post(`/api/events/${event.id}/check-in`, { token: forged });
    assert.equal(response.body.reason, 'INVALID_TICKET', 'signature covers the expiry');
  });

  it('refuses a token pointed at somebody else’s registration', async () => {
    const { organizer, event, ticket } = await scenario();

    const other = createClient(server.baseUrl);
    await signUp(other, 'ATTENDEE');
    const otherTicket = (await other.post(`/api/events/${event.id}/register`)).body.ticket;

    // Take a valid token and swap in the other registration's id.
    const parts = ticket.qrPayload.split('.');
    const forged = [parts[0], otherTicket.id, parts[2], parts[3]].join('.');

    const response = await organizer.post(`/api/events/${event.id}/check-in`, { token: forged });
    assert.equal(response.body.reason, 'INVALID_TICKET');
  });

  it('refuses malformed and empty-ish codes', async () => {
    const { organizer, event } = await scenario();

    for (const token of ['garbage', 'MIC1.only.three', 'MIC1.a.b.c', 'MIC9.x.1.y']) {
      const response = await organizer.post(`/api/events/${event.id}/check-in`, { token });
      assert.equal(response.body.reason, 'INVALID_TICKET', `accepted ${token}`);
    }
  });

  it('still accepts a scan that was queued offline before the code expired', async () => {
    const { organizer, event, ticket } = await scenario();

    // Scanned 20 seconds after issue (valid then), synced half an hour later.
    const response = await organizer.post(`/api/events/${event.id}/check-in/sync`, {
      scans: [
        {
          clientScanId: 'scan-rotating-0001',
          token: ticket.qrPayload,
          scannedAt: new Date(Date.now() + 20_000).toISOString(),
          stationId: 'door-a',
        },
      ],
    });

    assert.equal(
      response.body.results[0].success,
      true,
      'expiry is judged at the door, not at sync time',
    );
  });

  it('still rejects a queued scan whose code was already stale at the door', async () => {
    process.env.TICKET_TTL_SECONDS = '1';
    try {
      const { organizer, event, attendee, ticket } = await scenario();
      const fresh = (await attendee.get(`/api/registrations/${ticket.id}`)).body.ticket;

      const response = await organizer.post(`/api/events/${event.id}/check-in/sync`, {
        scans: [
          {
            clientScanId: 'scan-rotating-0002',
            token: fresh.qrPayload,
            // Scanned 30s later — after this code had already died.
            scannedAt: new Date(Date.now() + 30_000).toISOString(),
            stationId: 'door-a',
          },
        ],
      });

      assert.equal(response.body.results[0].reason, 'EXPIRED_TICKET');
    } finally {
      delete process.env.TICKET_TTL_SECONDS;
    }
  });

  it('still catches a ticket presented at the wrong event', async () => {
    const { organizer, ticket } = await scenario();
    const otherEvent = await createEvent(organizer, { name: 'Different Event' });

    const response = await organizer.post(`/api/events/${otherEvent.id}/check-in`, {
      token: ticket.qrPayload,
    });
    assert.equal(response.body.reason, 'WRONG_EVENT');
  });
});
