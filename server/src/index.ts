import { createServer } from 'node:http';
import { createApp } from './app.js';
import { env } from './env.js';
import { initRealtime, closeRealtime } from './lib/realtime.js';

const app = createApp();

// An explicit http server so Socket.IO can share the port with the REST API.
const server = createServer(app);
initRealtime(server);

server.listen(env.port, () => {
  console.log(`[api] MIC Event API listening on http://localhost:${env.port} (${env.nodeEnv})`);
  console.log(`[api] health: http://localhost:${env.port}/api/health`);
  console.log('[api] live updates: socket.io attached');
});

// Containers and PaaS providers stop processes with SIGTERM; close cleanly.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(`[api] ${signal} received, shutting down`);
    // closeRealtime() also closes this http server, since socket.io is
    // attached to it; only close it again if it somehow survived.
    void closeRealtime().then(() => {
      if (server.listening) server.close(() => process.exit(0));
      else process.exit(0);
    });
  });
}
