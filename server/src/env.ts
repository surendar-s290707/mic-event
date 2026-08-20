import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';

// The .env lives at the repository root so client and server share one file.
const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../.env') });

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .env and fill it in.`,
    );
  }
  return value;
}

/**
 * All configuration is read here once, so nothing else in the server reads
 * process.env directly. Missing required values fail at startup with a clear
 * message rather than at the first request.
 */
export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  /** Empty list = reflect the request origin (fine for local dev). */
  corsOrigins: (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  get databaseUrl() {
    return required('DATABASE_URL');
  },
  get jwtSecret() {
    return required('JWT_SECRET');
  },
  sessionTtlDays: Number(process.env.SESSION_TTL_DAYS ?? 7),
  /**
   * Optional. Without it the insights endpoint still answers, using the raw
   * numbers it computed. Server-side only — never sent to the browser.
   * Read lazily so tests can point the SDK at a stub.
   */
  get anthropicApiKey(): string | null {
    return process.env.ANTHROPIC_API_KEY?.trim() || null;
  },
  /** Overrides the Anthropic endpoint. Used by tests; unset in production. */
  get anthropicBaseUrl(): string | undefined {
    return process.env.ANTHROPIC_BASE_URL?.trim() || undefined;
  },
  /**
   * How long a displayed ticket code stays valid. Shorter is safer against
   * screenshot sharing but demands a more reliable connection at the door.
   */
  get ticketTtlSeconds(): number {
    return Number(process.env.TICKET_TTL_SECONDS ?? 60);
  },
  /** How long the model gets before the endpoint falls back to raw numbers. */
  get aiTimeoutMs(): number {
    return Number(process.env.AI_TIMEOUT_MS ?? 8000);
  },
};

export const isProduction = env.nodeEnv === 'production';
