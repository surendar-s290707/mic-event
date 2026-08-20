import { Router } from 'express';
import { env } from '../env.js';
import { prisma } from '../lib/prisma.js';

export const healthRouter = Router();

/**
 * GET /api/health
 * Liveness probe, including a cheap database round-trip — the client's status
 * pill should go red when the database is unreachable, not just when the
 * process is down.
 */
healthRouter.get('/', async (_req, res) => {
  let database: 'up' | 'down' = 'up';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = 'down';
  }

  res.status(database === 'up' ? 200 : 503).json({
    status: database === 'up' ? 'ok' : 'degraded',
    service: 'mic-event-api',
    message:
      database === 'up' ? 'MIC Event API is running' : 'API is running but the database is unreachable',
    database,
    version: '0.2.0',
    environment: env.nodeEnv,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});
