import { Router } from 'express';
import { healthRouter } from './health.js';
import { authRouter } from './auth.js';
import { eventsRouter } from './events.js';
import { registrationsRouter } from './registrations.js';

/**
 * Every API route is mounted here.
 *
 * Authorization lives inside each router (requireAuth / requireRole /
 * ownership checks) rather than being layered on by path, so reading a handler
 * tells you exactly who may call it.
 */
export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/events', eventsRouter);
apiRouter.use('/registrations', registrationsRouter);
