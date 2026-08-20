import type { Server } from 'node:http';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

/**
 * Integration-test helpers.
 *
 * The tests drive the real HTTP surface against a real PostgreSQL database
 * (TEST_DATABASE_URL) — no mocked Prisma. That is the only way to test the
 * things that matter here: unique constraints, transactions and cookies.
 */

export interface TestServer {
  baseUrl: string;
  close: () => Promise<void>;
}

export async function startTestServer(): Promise<TestServer> {
  const app = createApp();
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not bind a test port');

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

/** Empties every table. Called before each test so cases cannot leak into each other. */
export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "CheckIn", "Registration", "Event", "User" RESTART IDENTITY CASCADE',
  );
}

export interface ApiResponse<T = any> {
  status: number;
  body: T;
}

/**
 * A browser-ish client: it keeps the session cookie the server sets, exactly
 * like a real browser, so tests exercise the real auth mechanism.
 */
export function createClient(baseUrl: string) {
  let cookie = '';

  async function request<T = any>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<ApiResponse<T>> {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const setCookie = response.headers.getSetCookie();
    if (setCookie.length > 0) {
      cookie = setCookie.map((entry) => entry.split(';')[0]).join('; ');
    }

    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* CSV and other non-JSON responses come back as text */
    }
    return { status: response.status, body: parsed as T };
  }

  return {
    get: <T = any>(path: string) => request<T>('GET', path),
    post: <T = any>(path: string, body?: unknown) => request<T>('POST', path, body),
    /** Drops the cookie without calling the server — simulates a fresh browser. */
    forgetSession: () => {
      cookie = '';
    },
    get cookie() {
      return cookie;
    },
  };
}

export type TestClient = ReturnType<typeof createClient>;

let userCounter = 0;

/** Signs up a fresh account and leaves the client logged in as them. */
export async function signUp(
  client: TestClient,
  role: 'ORGANIZER' | 'ATTENDEE',
  overrides: { name?: string; email?: string; password?: string } = {},
) {
  userCounter += 1;
  const input = {
    name: overrides.name ?? `Test ${role} ${userCounter}`,
    email: overrides.email ?? `user${userCounter}.${Date.now()}@test.mic.dev`,
    password: overrides.password ?? 'testpassword123',
    role,
  };
  const response = await client.post('/api/auth/signup', input);
  if (response.status !== 201) {
    throw new Error(`signUp failed: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return { ...input, user: response.body.user };
}

/** Creates an event owned by whoever `client` is logged in as. */
export async function createEvent(
  client: TestClient,
  overrides: { name?: string; capacity?: number; startsAt?: Date; endsAt?: Date } = {},
) {
  const startsAt = overrides.startsAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000);
  const endsAt = overrides.endsAt ?? new Date(startsAt.getTime() + 2 * 60 * 60 * 1000);
  const response = await client.post('/api/events', {
    name: overrides.name ?? 'Test Event',
    description: 'For testing.',
    venue: 'Test Hall',
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    capacity: overrides.capacity ?? 10,
  });
  if (response.status !== 201) {
    throw new Error(`createEvent failed: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return response.body.event;
}

export async function disconnect() {
  await prisma.$disconnect();
}
