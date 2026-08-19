import { createApp } from './app.js';
import { env } from './env.js';

const app = createApp();

const server = app.listen(env.port, () => {
  console.log(`[api] MIC Event API listening on http://localhost:${env.port} (${env.nodeEnv})`);
  console.log(`[api] health: http://localhost:${env.port}/api/health`);
});

// Containers and PaaS providers stop processes with SIGTERM; close cleanly.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(`[api] ${signal} received, shutting down`);
    server.close(() => process.exit(0));
  });
}
