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

describe('registration', () => {
  let server: TestServer;

  before(async () => {
    server = await startTestServer();
  });
  after(async () => {
    await server.close();
    await disconnect();
  });
  beforeEach(resetDatabase);

  async function organizerWithEvent(capacity = 10, extras: { endsAt?: Date; startsAt?: Date } = {}) {
    const organizer = createClient(server.baseUrl);
    await signUp(organizer, 'ORGANIZER');
    const event = await createEvent(organizer, { capacity, ...extras });
    return { organizer, event };
  }

  it('registers an attendee and issues a unique opaque token', async () => {
    const { event } = await organizerWithEvent();
    const attendee = createClient(server.baseUrl);
    const account = await signUp(attendee, 'ATTENDEE');

    const response = await attendee.post(`/api/events/${event.id}/register`);
    assert.equal(response.status, 201);

    const ticket = response.body.ticket;
    assert.equal(ticket.attendee.name, account.name);
    assert.equal(ticket.checkedIn, false);
    assert.ok(ticket.qrToken.length >= 32, 'token is long enough to be unguessable');
    // The token must not carry anything about the person or the event.
    assert.equal(ticket.qrToken.includes(account.email), false);
    assert.equal(ticket.qrToken.includes(event.id), false);
  });

  it('gives two attendees different tokens', async () => {
    const { event } = await organizerWithEvent();

    const first = createClient(server.baseUrl);
    await signUp(first, 'ATTENDEE');
    const second = createClient(server.baseUrl);
    await signUp(second, 'ATTENDEE');

    const one = await first.post(`/api/events/${event.id}/register`);
    const two = await second.post(`/api/events/${event.id}/register`);

    assert.notEqual(one.body.ticket.qrToken, two.body.ticket.qrToken);
  });

  it('refuses a second registration from the same attendee', async () => {
    const { event } = await organizerWithEvent();
    const attendee = createClient(server.baseUrl);
    await signUp(attendee, 'ATTENDEE');

    assert.equal((await attendee.post(`/api/events/${event.id}/register`)).status, 201);

    const duplicate = await attendee.post(`/api/events/${event.id}/register`);
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.error, 'already_registered');
  });

  it('404s for an event that does not exist', async () => {
    const attendee = createClient(server.baseUrl);
    await signUp(attendee, 'ATTENDEE');

    const response = await attendee.post('/api/events/no-such-event/register');
    assert.equal(response.status, 404);
  });

  it('refuses registration for an event that has finished', async () => {
    const { event } = await organizerWithEvent(10, {
      startsAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
      endsAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    const attendee = createClient(server.baseUrl);
    await signUp(attendee, 'ATTENDEE');

    const response = await attendee.post(`/api/events/${event.id}/register`);
    assert.equal(response.status, 409);
    assert.equal(response.body.error, 'registration_closed');
  });

  it('rejects an invalid capacity when the event is created', async () => {
    const organizer = createClient(server.baseUrl);
    await signUp(organizer, 'ORGANIZER');

    const base = {
      name: 'Capacity Test',
      venue: 'Hall',
      startsAt: new Date(Date.now() + 86_400_000).toISOString(),
      endsAt: new Date(Date.now() + 90_000_000).toISOString(),
    };

    for (const capacity of [0, -5, 2.5, 'ten']) {
      const response = await organizer.post('/api/events', { ...base, capacity });
      assert.equal(response.status, 400, `capacity ${capacity} should be rejected`);
      assert.ok(response.body.details.capacity);
    }
  });

  it('rejects an event that ends before it starts', async () => {
    const organizer = createClient(server.baseUrl);
    await signUp(organizer, 'ORGANIZER');

    const response = await organizer.post('/api/events', {
      name: 'Backwards',
      venue: 'Hall',
      startsAt: new Date(Date.now() + 90_000_000).toISOString(),
      endsAt: new Date(Date.now() + 86_400_000).toISOString(),
      capacity: 5,
    });
    assert.equal(response.status, 400);
  });

  it('never exceeds capacity, even when everyone registers at once', async () => {
    const capacity = 3;
    const { event } = await organizerWithEvent(capacity);

    // 20 different attendees, all firing at the same moment.
    const attendees = await Promise.all(
      Array.from({ length: 20 }, async () => {
        const client = createClient(server.baseUrl);
        await signUp(client, 'ATTENDEE');
        return client;
      }),
    );

    const results = await Promise.all(
      attendees.map((client) => client.post(`/api/events/${event.id}/register`)),
    );

    const created = results.filter((r) => r.status === 201);
    const full = results.filter((r) => r.body?.error === 'event_full');

    assert.equal(created.length, capacity, `exactly ${capacity} registrations succeed`);
    assert.equal(full.length, 20 - capacity, 'everyone else is told the event is full');

    // And the database agrees — this is the claim that actually matters.
    const { prisma } = await import('../src/lib/prisma.js');
    const rows = await prisma.registration.count({ where: { eventId: event.id } });
    assert.equal(rows, capacity);
  });

  it('lets an attendee read their own registration for an event', async () => {
    const { event } = await organizerWithEvent();
    const attendee = createClient(server.baseUrl);
    await signUp(attendee, 'ATTENDEE');

    const before = await attendee.get(`/api/events/${event.id}/registration`);
    assert.equal(before.status, 404, 'not registered yet');

    await attendee.post(`/api/events/${event.id}/register`);

    const after = await attendee.get(`/api/events/${event.id}/registration`);
    assert.equal(after.status, 200);
    assert.equal(after.body.ticket.event.id, event.id);
  });
});
