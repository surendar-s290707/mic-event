import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';

// The .env lives at the repository root so client and server share one file.
const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../.env') });

/**
 * All configuration is read here once, so nothing else in the server reads
 * process.env directly. That keeps deployment surprises in one file.
 */
export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  /** Empty list = allow any origin (fine for local dev; set this in production). */
  corsOrigins: (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
};

export const isProduction = env.nodeEnv === 'production';
