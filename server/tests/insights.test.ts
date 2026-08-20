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
 * AI insights. These run with no ANTHROPIC_API_KEY, which is deliberate: they
 * assert that the numbers are right and that the fallback works, without
 * depending on a network call. The numbers are the part that must never be
 * wrong — the AI only rephrases them.
 */
describe('AI event insights', () => {
  let server: TestServer;

  before(async () => {
    server = await startTestServer();
  });
  after(async () => {
    await server.close();
    await disconnect();
  });
  beforeEach(resetDatabase);

  /** An event with `registered` attendees, `checkedIn` of whom are inside. */
  async function scenario({ capacity = 10, registered = 4, checkedIn = 2 } = {}) {
    const organizer = createClient(server.baseUrl);
    await signUp(organizer, 'ORGANIZER');
    const event = await createEvent(organizer, { capacity });

    const tokens: string[] = [];
    for (let i = 0; i < registered; i += 1) {
      const attendee = createClient(server.baseUrl);
      await signUp(attendee, 'ATTENDEE');
      const registration = await attendee.post(`/api/events/${event.id}/register`);
      tokens.push(registration.body.ticket.qrPayload);
    }
    for (let i = 0; i < checkedIn; i += 1) {
      await organizer.post(`/api/events/${event.id}/check-in`, { token: tokens[i] });
    }
    return { organizer, event, tokens };
  }

  const ask = (client: ReturnType<typeof createClient>, eventId: string, question: string) =>
    client.post(`/api/events/${eventId}/insights`, { question });

  it('computes the four required figures from the database', async () => {
    const { organizer, event } = await scenario({ capacity: 10, registered: 4, checkedIn: 3 });

    const response = await organizer.get(`/api/events/${event.id}/insights/facts`);
    const facts = response.body.facts;

    assert.equal(facts.checkedInCount, 3, 'how many have checked in');
    assert.equal(facts.noShowCount, 1);
    assert.equal(facts.noShowPercent, 25, 'percentage of registered attendees who are no-shows');
    assert.equal(facts.spotsLeft, 6, 'how many spots are left');
    assert.ok(facts.peakWindow, 'what time check-ins peaked');
    assert.equal(facts.peakWindow.count, 3);
    assert.equal(facts.attendancePercent, 75);
  });

  it('reports no peak when nobody has arrived', async () => {
    const { organizer, event } = await scenario({ registered: 2, checkedIn: 0 });

    const facts = (await organizer.get(`/api/events/${event.id}/insights/facts`)).body.facts;
    assert.equal(facts.peakWindow, null);
    assert.equal(facts.firstCheckInAt, null);
    assert.equal(facts.noShowPercent, 100);
  });

  it('does not divide by zero when nobody registered', async () => {
    const { organizer, event } = await scenario({ registered: 0, checkedIn: 0 });

    const facts = (await organizer.get(`/api/events/${event.id}/insights/facts`)).body.facts;
    assert.equal(facts.noShowPercent, 0);
    assert.equal(facts.attendancePercent, 0);
  });

  it('answers with the raw computed numbers when the AI is unavailable', async () => {
    const { organizer, event } = await scenario({ capacity: 10, registered: 4, checkedIn: 3 });

    const response = await ask(organizer, event.id, 'How many people have checked in so far?');

    assert.equal(response.status, 200);
    assert.equal(response.body.source, 'fallback');
    assert.equal(response.body.fallbackReason, 'not_configured');
    // The fallback is not an error message — it is the answer, in numbers.
    assert.match(response.body.answer, /3 of 4 registered/);
    assert.match(response.body.answer, /1 has not turned up yet/, 'singular reads correctly');
    assert.match(response.body.answer, /25% no-shows/);
    assert.match(response.body.answer, /6 of 10 seats/);
  });

  it('returns the facts alongside every answer', async () => {
    const { organizer, event } = await scenario({ registered: 3, checkedIn: 1 });

    const response = await ask(organizer, event.id, 'What percentage are no-shows?');
    assert.equal(response.body.facts.checkedInCount, 1);
    assert.equal(response.body.facts.noShowCount, 2);
    assert.ok(['ai', 'fallback'].includes(response.body.source));
  });

  it('rejects an empty or oversized question', async () => {
    const { organizer, event } = await scenario();

    assert.equal((await ask(organizer, event.id, '  ')).status, 400);
    assert.equal((await ask(organizer, event.id, 'x'.repeat(400))).status, 400);
  });

  it('is organizer-owner only', async () => {
    const { event } = await scenario();

    const intruder = createClient(server.baseUrl);
    await signUp(intruder, 'ORGANIZER');
    assert.equal((await ask(intruder, event.id, 'How many checked in?')).status, 403);
    assert.equal((await intruder.get(`/api/events/${event.id}/insights/facts`)).status, 403);

    const attendee = createClient(server.baseUrl);
    await signUp(attendee, 'ATTENDEE');
    assert.equal((await ask(attendee, event.id, 'How many checked in?')).status, 403);

    const stranger = createClient(server.baseUrl);
    assert.equal((await ask(stranger, event.id, 'How many checked in?')).status, 401);
  });

  it('never exposes the API key', async () => {
    const { organizer, event } = await scenario();

    const response = await ask(organizer, event.id, 'How many spots are left?');
    const body = JSON.stringify(response.body).toLowerCase();
    assert.equal(body.includes('sk-ant'), false);
    assert.equal(body.includes('apikey'), false);
    assert.equal(body.includes('anthropic_api_key'), false);
  });
});

/**
 * The AI path itself, against a stub Anthropic endpoint. No network, no key,
 * no flakiness — but it exercises the real SDK call, the response parsing and
 * every fallback branch.
 */
describe('AI insights — the model call', () => {
  let server: TestServer;
  let stub: { url: string; close: () => Promise<void> };
  let behaviour: 'ok' | 'slow' | 'error' | 'empty' = 'ok';
  let lastRequestBody: any = null;

  before(async () => {
    server = await startTestServer();

    const { createServer } = await import('node:http');
    const httpStub = createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk) => (raw += chunk));
      req.on('end', async () => {
        lastRequestBody = JSON.parse(raw || '{}');

        if (behaviour === 'error') {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'boom' } }));
          return;
        }
        if (behaviour === 'slow') {
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            id: 'msg_stub',
            type: 'message',
            role: 'assistant',
            model: 'claude-opus-5',
            content: behaviour === 'empty' ? [] : [{ type: 'text', text: 'Three of the four people who registered are already inside.' }],
            stop_reason: 'end_turn',
            usage: { input_tokens: 10, output_tokens: 10 },
          }),
        );
      });
    });
    await new Promise<void>((resolve) => httpStub.listen(0, resolve));
    const address = httpStub.address();
    if (!address || typeof address === 'string') throw new Error('stub failed to bind');

    stub = {
      url: `http://127.0.0.1:${address.port}`,
      close: () => new Promise<void>((resolve) => httpStub.close(() => resolve())),
    };

    process.env.ANTHROPIC_API_KEY = 'test-key-not-real';
    process.env.ANTHROPIC_BASE_URL = stub.url;
    process.env.AI_TIMEOUT_MS = '400';
  });

  after(async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_BASE_URL;
    delete process.env.AI_TIMEOUT_MS;
    await stub.close();
    await server.close();
    await disconnect();
  });

  beforeEach(async () => {
    await resetDatabase();
    behaviour = 'ok';
    lastRequestBody = null;
  });

  async function eventWithNumbers() {
    const organizer = createClient(server.baseUrl);
    await signUp(organizer, 'ORGANIZER');
    const event = await createEvent(organizer, { capacity: 10 });

    const tokens: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      const attendee = createClient(server.baseUrl);
      await signUp(attendee, 'ATTENDEE');
      tokens.push((await attendee.post(`/api/events/${event.id}/register`)).body.ticket.qrPayload);
    }
    for (let i = 0; i < 3; i += 1) {
      await organizer.post(`/api/events/${event.id}/check-in`, { token: tokens[i] });
    }
    return { organizer, event };
  }

  it('uses the model’s wording when the API answers', async () => {
    const { organizer, event } = await eventWithNumbers();

    const response = await organizer.post(`/api/events/${event.id}/insights`, {
      question: 'How many people have checked in so far?',
    });

    assert.equal(response.body.source, 'ai');
    assert.equal(response.body.answer, 'Three of the four people who registered are already inside.');
  });

  it('sends the computed facts, and instructs the model not to calculate', async () => {
    const { organizer, event } = await eventWithNumbers();

    await organizer.post(`/api/events/${event.id}/insights`, { question: 'How many spots are left?' });

    assert.equal(lastRequestBody.model, 'claude-opus-5');
    assert.match(lastRequestBody.system, /Never calculate, estimate, extrapolate or\s+invent a number/);

    // The real figures reach the model as facts, not as something to work out.
    const sent = lastRequestBody.messages[0].content;
    assert.match(sent, /"checkedInCount": 3/);
    assert.match(sent, /"registeredCount": 4/);
    assert.match(sent, /"noShowCount": 1/);
    assert.match(sent, /"spotsLeft": 6/);
    assert.match(sent, /"noShowPercent": 25/);
  });

  it('falls back to raw numbers when the model times out', async () => {
    behaviour = 'slow'; // 1.5s against a 400ms timeout
    const { organizer, event } = await eventWithNumbers();

    const response = await organizer.post(`/api/events/${event.id}/insights`, {
      question: 'What time did check-ins peak?',
    });

    assert.equal(response.status, 200, 'a slow model must not fail the request');
    assert.equal(response.body.source, 'fallback');
    assert.equal(response.body.fallbackReason, 'timeout');
    assert.match(response.body.answer, /3 of 4 registered/);
  });

  it('falls back to raw numbers when the API errors', async () => {
    behaviour = 'error';
    const { organizer, event } = await eventWithNumbers();

    const response = await organizer.post(`/api/events/${event.id}/insights`, {
      question: 'How many spots are left?',
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.source, 'fallback');
    assert.equal(response.body.fallbackReason, 'api_error');
    assert.match(response.body.answer, /6 of 10 seats/);
  });

  it('falls back when the model returns nothing usable', async () => {
    behaviour = 'empty';
    const { organizer, event } = await eventWithNumbers();

    const response = await organizer.post(`/api/events/${event.id}/insights`, {
      question: 'How many spots are left?',
    });

    assert.equal(response.body.source, 'fallback');
    assert.match(response.body.answer, /seats are still open/);
  });
});
