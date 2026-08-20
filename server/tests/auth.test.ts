import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createClient,
  disconnect,
  resetDatabase,
  signUp,
  startTestServer,
  type TestServer,
} from './helpers.js';

describe('authentication', () => {
  let server: TestServer;

  before(async () => {
    server = await startTestServer();
  });
  after(async () => {
    await server.close();
    await disconnect();
  });
  beforeEach(resetDatabase);

  it('signs up a new account and starts a session', async () => {
    const client = createClient(server.baseUrl);
    const response = await client.post('/api/auth/signup', {
      name: 'Nadia Rahman',
      email: 'nadia@test.mic.dev',
      password: 'goodpassword1',
      role: 'ATTENDEE',
    });

    assert.equal(response.status, 201);
    assert.equal(response.body.user.email, 'nadia@test.mic.dev');
    assert.equal(response.body.user.role, 'ATTENDEE');
    assert.ok(client.cookie.includes('mic_session'), 'a session cookie is set');
  });

  it('never returns the password hash', async () => {
    const client = createClient(server.baseUrl);
    const signup = await client.post('/api/auth/signup', {
      name: 'Hash Check',
      email: 'hash@test.mic.dev',
      password: 'goodpassword1',
      role: 'ATTENDEE',
    });
    const me = await client.get('/api/auth/me');

    for (const payload of [signup.body, me.body]) {
      assert.equal(JSON.stringify(payload).includes('passwordHash'), false);
      assert.equal(JSON.stringify(payload).includes('goodpassword1'), false);
    }
  });

  it('stores the password as a hash, not plain text', async () => {
    const client = createClient(server.baseUrl);
    await signUp(client, 'ATTENDEE', { email: 'plain@test.mic.dev', password: 'goodpassword1' });

    const { prisma } = await import('../src/lib/prisma.js');
    const user = await prisma.user.findUnique({ where: { email: 'plain@test.mic.dev' } });
    assert.ok(user);
    assert.notEqual(user.passwordHash, 'goodpassword1');
    assert.match(user.passwordHash, /^\$2[aby]\$/, 'looks like a bcrypt hash');
  });

  it('rejects a duplicate email', async () => {
    const client = createClient(server.baseUrl);
    const account = { name: 'First', email: 'taken@test.mic.dev', password: 'goodpassword1', role: 'ATTENDEE' };
    assert.equal((await client.post('/api/auth/signup', account)).status, 201);

    const second = await client.post('/api/auth/signup', { ...account, name: 'Second' });
    assert.equal(second.status, 409);
    assert.equal(second.body.error, 'email_taken');
  });

  it('rejects malformed signup input with per-field messages', async () => {
    const client = createClient(server.baseUrl);
    const response = await client.post('/api/auth/signup', {
      name: 'A',
      email: 'not-an-email',
      password: 'short',
      role: 'WIZARD',
    });

    assert.equal(response.status, 400);
    assert.ok(response.body.details.email);
    assert.ok(response.body.details.password);
    assert.ok(response.body.details.role);
  });

  it('logs in with the right password', async () => {
    const client = createClient(server.baseUrl);
    const account = await signUp(client, 'ORGANIZER');
    client.forgetSession();

    const response = await client.post('/api/auth/login', {
      email: account.email,
      password: account.password,
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.user.email, account.email);
  });

  it('refuses the wrong password', async () => {
    const client = createClient(server.baseUrl);
    const account = await signUp(client, 'ORGANIZER');
    client.forgetSession();

    const response = await client.post('/api/auth/login', {
      email: account.email,
      password: 'definitely-not-it',
    });
    assert.equal(response.status, 401);
    assert.equal(response.body.error, 'unauthorized');
  });

  it('gives the same answer for an unknown email as for a wrong password', async () => {
    const client = createClient(server.baseUrl);
    const account = await signUp(client, 'ORGANIZER');
    client.forgetSession();

    const wrongPassword = await client.post('/api/auth/login', {
      email: account.email,
      password: 'definitely-not-it',
    });
    const unknownEmail = await client.post('/api/auth/login', {
      email: 'ghost@test.mic.dev',
      password: 'definitely-not-it',
    });

    assert.equal(wrongPassword.status, unknownEmail.status);
    assert.equal(wrongPassword.body.message, unknownEmail.body.message);
  });

  it('logs out, and the session stops working', async () => {
    const client = createClient(server.baseUrl);
    await signUp(client, 'ATTENDEE');
    assert.equal((await client.get('/api/auth/me')).status, 200);

    assert.equal((await client.post('/api/auth/logout')).status, 200);
    assert.equal((await client.get('/api/auth/me')).status, 401);
  });

  it('rejects unauthenticated requests', async () => {
    const client = createClient(server.baseUrl);
    for (const path of ['/api/auth/me', '/api/events']) {
      const response = await client.get(path);
      assert.equal(response.status, 401, `${path} should require a session`);
    }
  });

  it('rejects a tampered session cookie', async () => {
    const response = await fetch(`${server.baseUrl}/api/auth/me`, {
      headers: { Cookie: 'mic_session=not.a.real.token' },
    });
    assert.equal(response.status, 401);
  });
});
