import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import { env } from './env.js';
import { apiRouter } from './routes/index.js';

export function createApp() {
  const app = express();

  app.use(
    cors({
      // No configured origins => reflect the request origin (local development).
      origin: env.corsOrigins.length > 0 ? env.corsOrigins : true,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  app.use('/api', apiRouter);

  // Unknown API path -> JSON 404 (never an HTML error page the client can't parse).
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'not_found', message: 'No such API endpoint' });
  });

  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    console.error('[api] unhandled error:', err);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong' });
  };
  app.use(errorHandler);

  return app;
}
