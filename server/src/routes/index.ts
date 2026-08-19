import { Router } from 'express';
import { healthRouter } from './health.js';

/**
 * Single place where every API route is mounted.
 *
 * CURRENT (milestone 1): only /api/health is implemented.
 *
 * FUTURE milestones will mount real routers here — auth, events,
 * registrations, check-ins, analytics and ai. They are deliberately NOT
 * stubbed out yet: an endpoint that exists but returns nothing is worse than
 * an endpoint that does not exist. See docs/API.md for the planned surface.
 */
export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
