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
 * The frontend hides screens; these tests are about the boundary that matters —
 * a hand-written request straight at the API.
 */
describe('authorization', () => {
  let server: TestServer;

  before(async () => {
    server = await startTestServer();
  });
  after(async () => {
    await server.close();
    await disconnect();
  });
  beforeEach(resetDatabase);

  it('lets an organizer create an event and makes them its owner', async () => {
    const organizer = createClient(server.baseUrl);
    const account = await signUp(organizer, 'ORGANIZER');

    const event = await createEvent(organizer, { name: 'Owned Event' });
    assert.equal(event.organizer.id, account.user.id);
  });

  it('stops an attendee creating an event', async () => {
    const attendee = createClient(server.baseUrl);
    await signUp(attendee, 'ATTENDEE');

    const response = await attendee.post('/api/events', {
      name: 'Sneaky Event',
      venue: 'Nowhere',
      startsAt: new Date(Date.now() + 86_400_000).toISOString(),
      endsAt: new Date(Date.now() + 90_000_000).toISOString(),
      capacity: 10,
    });

    assert.equal(response.status, 403);
    assert.equal(response.body.error, 'forbidden');
  });

  it('stops an organizer touching another organizer’s event', async () => {
    const owner = createClient(server.baseUrl);
    await signUp(owner, 'ORGANIZER');
    const event = await createEvent(owner);

    const intruder = createClient(server.baseUrl);
    await signUp(intruder, 'ORGANIZER');

    const stats = await intruder.get(`/api/events/${event.id}/stats`);
    const scan = await intruder.post(`/api/events/${event.id}/check-in`, { token: 'anything' });
    const csv = await intruder.get(`/api/events/${event.id}/export.csv`);

    for (const [name, response] of [['stats', stats], ['check-in', scan], ['export', csv]] as const) {
      assert.equal(response.status, 403, `${name} should be forbidden`);
    }
  });

  it('stops an attendee reaching organizer endpoints', async () => {
    const organizer = createClient(server.baseUrl);
    await signUp(organizer, 'ORGANIZER');
    const event = await createEvent(organizer);

    const attendee = createClient(server.baseUrl);
    await signUp(attendee, 'ATTENDEE');

    assert.equal((await attendee.get(`/api/events/${event.id}/stats`)).status, 403);
    assert.equal(
      (await attendee.post(`/api/events/${event.id}/check-in`, { token: 'x' })).status,
      403,
    );
    assert.equal((await attendee.get(`/api/events/${event.id}/export.csv`)).status, 403);
  });

  it('stops an organizer registering as if they were an attendee', async () => {
    const organizer = createClient(server.baseUrl);
    await signUp(organizer, 'ORGANIZER');
    const event = await createEvent(organizer);

    assert.equal((await organizer.post(`/api/events/${event.id}/register`)).status, 403);
  });

  it('only shows an organizer their own events', async () => {
    const first = createClient(server.baseUrl);
    await signUp(first, 'ORGANIZER');
    await createEvent(first, { name: 'Mine' });

    const second = createClient(server.baseUrl);
    await signUp(second, 'ORGANIZER');
    await createEvent(second, { name: 'Theirs' });

    const list = await second.get('/api/events');
    assert.equal(list.body.events.length, 1);
    assert.equal(list.body.events[0].name, 'Theirs');
  });

  it('does not leak check-in counts to attendees', async () => {
    const organizer = createClient(server.baseUrl);
    await signUp(organizer, 'ORGANIZER');
    const event = await createEvent(organizer);

    const attendee = createClient(server.baseUrl);
    await signUp(attendee, 'ATTENDEE');

    const detail = await attendee.get(`/api/events/${event.id}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.event.checkedInCount, undefined);
  });

  it('keeps one attendee’s ticket away from another attendee', async () => {
    const organizer = createClient(server.baseUrl);
    await signUp(organizer, 'ORGANIZER');
    const event = await createEvent(organizer);

    const owner = createClient(server.baseUrl);
    await signUp(owner, 'ATTENDEE');
    const registration = await owner.post(`/api/events/${event.id}/register`);
    const ticketId = registration.body.ticket.id;

    const stranger = createClient(server.baseUrl);
    await signUp(stranger, 'ATTENDEE');

    const response = await stranger.get(`/api/registrations/${ticketId}`);
    assert.equal(response.status, 404, 'someone else’s ticket must not be readable');
  });
});
