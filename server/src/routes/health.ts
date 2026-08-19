import { Router } from 'express';
import { env } from '../env.js';

export const healthRouter = Router();

/**
 * GET /api/health
 * Cheap liveness probe. The client shows a small dev status pill based on it.
 * Later milestones will extend this with a database ping.
 */
healthRouter.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'mic-event-api',
    message: 'MIC Event API is running',
    version: '0.1.0',
    environment: env.nodeEnv,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});
