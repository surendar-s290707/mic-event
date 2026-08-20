import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env, isProduction } from './env.js';
import { apiRouter } from './routes/index.js';
import { ApiError } from './lib/errors.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(here, '../../client/dist');

export function createApp() {
  const app = express();

  app.use(
    cors({
      // No configured origins => reflect the request origin (local development).
      origin: env.corsOrigins.length > 0 ? env.corsOrigins : true,
      // Required for the session cookie to travel on cross-origin requests.
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.use('/api', apiRouter);

  // Unknown API path -> JSON 404 (never an HTML error page the client can't parse).
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'not_found', message: 'No such API endpoint' });
  });

  // In production the API also serves the built client, so the whole app is a
  // single deployable on one origin (no CORS, no second host). In development
  // Vite serves the client and proxies /api here instead.
  if (isProduction && fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    // Client-side routing: any non-API path falls back to index.html.
    app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    // Deliberate failures carry their own status and code.
    if (err instanceof ApiError) {
      res.status(err.status).json({ error: err.code, message: err.message, details: err.details });
      return;
    }
    // Anything else is a bug: log it in full, tell the client nothing.
    console.error('[api] unhandled error:', err);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong on our side.' });
  };
  app.use(errorHandler);

  return app;
}
