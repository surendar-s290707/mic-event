import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { io as connect, type Socket } from 'socket.io-client';
import {
  createClient,
  createEvent,
  disconnect,
  resetDatabase,
  signUp,
  startTestServer,
  type TestClient,
  type TestServer,
} from './helpers.js';

/**
 * The live dashboard: a check-in must reach the organizer without anyone
 * refreshing or polling.
 */
describe('live dashboard (socket.io)', () => {
  let server: TestServer;
  const sockets: Socket[] = [];

  before(async () => {
    server = await startTestServer({ realtime: true });
  });
  after(async () => {
    for (const socket of sockets) socket.disconnect();
    await server.close();
    await disconnect();
  });
  beforeEach(resetDatabase);

  /** Connects a socket carrying the given client's session cookie. */
  function openSocket(client: TestClient): Socket {
    const socket = connect(server.baseUrl, {
      extraHeaders: { Cookie: client.cookie },
      transports: ['websocket'],
      forceNew: true,
    });
    sockets.push(socket);
    return socket;
  }

  const waitFor = <T,>(socket: Socket, event: string, ms = 4000) =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timed out waiting for "${event}"`)), ms);
      socket.once(event, (payload: T) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });

  const join = (socket: Socket, eventId: string) =>
    new Promise<{ ok: boolean }>((resolve) => socket.emit('join-event', eventId, resolve));

  async function scenario() {
    const organizer = createClient(server.baseUrl);
    await signUp(organizer, 'ORGANIZER');
    const event = await createEvent(organizer, { capacity: 10 });

    const attendee = createClient(server.baseUrl);
    const account = await signUp(attendee, 'ATTENDEE');
    const registration = await attendee.post(`/api/events/${event.id}/register`);

    return { organizer, attendee, account, event, ticket: registration.body.ticket };
  }

  it('pushes a check-in to the organizer watching that event', async () => {
    const { organizer, event, ticket, account } = await scenario();

    const socket = openSocket(organizer);
    await waitFor(socket, 'connect');
    assert.deepEqual(await join(socket, event.id), { ok: true });

    // Nothing polls here: the assertion is that the message arrives on its own.
    const arrival = waitFor<{ eventId: string; attendeeName: string; checkedInAt: string }>(
      socket,
      'check-in',
    );
    await organizer.post(`/api/events/${event.id}/check-in`, {
      token: ticket.qrPayload,
      stationId: 'door-a',
    });

    const payload = await arrival;
    assert.equal(payload.eventId, event.id);
    assert.equal(payload.attendeeName, account.name);
    assert.ok(payload.checkedInAt);
  });

  it('pushes check-ins that arrive through offline sync too', async () => {
    const { organizer, event, ticket } = await scenario();

    const socket = openSocket(organizer);
    await waitFor(socket, 'connect');
    await join(socket, event.id);

    const arrival = waitFor<{ eventId: string }>(socket, 'check-in');
    await organizer.post(`/api/events/${event.id}/check-in/sync`, {
      scans: [
        {
          clientScanId: 'scan-live-0001',
          token: ticket.qrPayload,
          scannedAt: new Date(Date.now() - 60_000).toISOString(),
          stationId: 'door-b',
        },
      ],
    });

    assert.equal((await arrival).eventId, event.id);
  });

  it('says nothing when the scan was a duplicate', async () => {
    const { organizer, event, ticket } = await scenario();

    const socket = openSocket(organizer);
    await waitFor(socket, 'connect');
    await join(socket, event.id);

    // Subscribe before triggering, or the emit races ahead of the listener.
    const firstArrival = waitFor(socket, 'check-in');
    await organizer.post(`/api/events/${event.id}/check-in`, { token: ticket.qrPayload });
    await firstArrival; // the real one

    let extra = 0;
    socket.on('check-in', () => {
      extra += 1;
    });
    await organizer.post(`/api/events/${event.id}/check-in`, { token: ticket.qrPayload });
    await new Promise((resolve) => setTimeout(resolve, 500));

    assert.equal(extra, 0, 'a duplicate scan is not news');
  });

  it('refuses to join an event the caller does not own', async () => {
    const { event } = await scenario();

    const intruder = createClient(server.baseUrl);
    await signUp(intruder, 'ORGANIZER');
    const socket = openSocket(intruder);
    await waitFor(socket, 'connect');

    assert.deepEqual(await join(socket, event.id), { ok: false });
  });

  it('refuses to join as an attendee', async () => {
    const { event, attendee } = await scenario();

    const socket = openSocket(attendee);
    await waitFor(socket, 'connect');

    assert.deepEqual(await join(socket, event.id), { ok: false });
  });

  it('disconnects a socket with no session', async () => {
    const socket = connect(server.baseUrl, { transports: ['websocket'], forceNew: true });
    sockets.push(socket);

    const message = await waitFor<{ message: string }>(socket, 'unauthorized');
    assert.ok(message.message);
  });

  it('does not deliver another event’s check-ins into this room', async () => {
    const { organizer, event, ticket } = await scenario();
    const otherEvent = await createEvent(organizer, { name: 'Other Room' });

    const socket = openSocket(organizer);
    await waitFor(socket, 'connect');
    await join(socket, otherEvent.id);

    let received = 0;
    socket.on('check-in', () => {
      received += 1;
    });

    await organizer.post(`/api/events/${event.id}/check-in`, { token: ticket.qrPayload });
    await new Promise((resolve) => setTimeout(resolve, 500));

    assert.equal(received, 0);
  });
});
