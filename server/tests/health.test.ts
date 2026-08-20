import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, disconnect, startTestServer, type TestServer } from './helpers.js';

describe('health and error handling', () => {
  let server: TestServer;

  before(async () => {
    server = await startTestServer();
  });
  after(async () => {
    await server.close();
    await disconnect();
  });

  it('reports the API and its database as up', async () => {
    const client = createClient(server.baseUrl);
    const response = await client.get('/api/health');

    assert.equal(response.status, 200);
    assert.equal(response.body.status, 'ok');
    assert.equal(response.body.database, 'up');
  });

  it('answers unknown API paths with JSON, not HTML', async () => {
    const client = createClient(server.baseUrl);
    const response = await client.get('/api/definitely-not-a-route');

    assert.equal(response.status, 404);
    assert.equal(response.body.error, 'not_found');
  });
});
