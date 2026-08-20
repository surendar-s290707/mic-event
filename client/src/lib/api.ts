/**
 * The only place that talks to the backend.
 *
 * Session handling is `credentials: 'include'`: the session lives in an
 * HTTP-only cookie, so there is no token for this code to store or attach.
 *
 * Development: base URL is empty and Vite proxies /api to Express.
 * Production:  VITE_API_BASE_URL points at the API origin.
 */
import type {
  EventSummary,
  Role,
  ScanResult,
  StatsResponse,
  SyncResult,
  Ticket,
  User,
} from './types';

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    /** Field-level messages from validation, e.g. { email: "…" }. */
    readonly details?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isUnauthorized() {
    return this.status === 401;
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const { timeoutMs = 10_000, body, ...init } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      body,
      credentials: 'include',
      signal: controller.signal,
      headers: body ? { 'Content-Type': 'application/json', ...init.headers } : init.headers,
    });
  } catch (error) {
    // Network failure or timeout — the API is unreachable, not refusing us.
    throw new ApiError(
      error instanceof Error && error.name === 'AbortError'
        ? 'The server took too long to answer.'
        : 'We can’t reach the server. Check your connection.',
      0,
      'network_error',
    );
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      payload?.message ?? `Request failed (${response.status})`,
      response.status,
      payload?.error ?? 'error',
      payload?.details,
    );
  }
  return payload as T;
}

const json = (data: unknown) => JSON.stringify(data);

export interface HealthResponse {
  status: string;
  service: string;
  message: string;
  database: 'up' | 'down';
  version: string;
  environment: string;
  uptimeSeconds: number;
  timestamp: string;
}

export const api = {
  health: () => request<HealthResponse>('/api/health', { timeoutMs: 4000 }),

  // --- auth ---
  signup: (input: { name: string; email: string; password: string; role: Role }) =>
    request<{ user: User }>('/api/auth/signup', { method: 'POST', body: json(input) }),
  login: (input: { email: string; password: string }) =>
    request<{ user: User }>('/api/auth/login', { method: 'POST', body: json(input) }),
  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  me: () => request<{ user: User }>('/api/auth/me'),

  // --- events ---
  listEvents: () => request<{ events: EventSummary[] }>('/api/events'),
  getEvent: (eventId: string) => request<{ event: EventSummary }>(`/api/events/${eventId}`),
  createEvent: (input: {
    name: string;
    description: string;
    venue: string;
    startsAt: string;
    endsAt: string;
    capacity: number;
  }) => request<{ event: EventSummary }>('/api/events', { method: 'POST', body: json(input) }),

  // --- registrations / tickets ---
  register: (eventId: string) =>
    request<{ ticket: Ticket }>(`/api/events/${eventId}/register`, { method: 'POST' }),
  myTicketForEvent: (eventId: string) =>
    request<{ ticket: Ticket }>(`/api/events/${eventId}/registration`),
  getTicket: (registrationId: string) =>
    request<{ ticket: Ticket }>(`/api/registrations/${registrationId}`),

  // --- organizer ---
  checkIn: (
    eventId: string,
    token: string,
    options: { stationId?: string; clientScanId?: string; scannedAt?: string } = {},
  ) =>
    request<ScanResult>(`/api/events/${eventId}/check-in`, {
      method: 'POST',
      body: json({ token, ...options }),
    }),
  /** Replays scans queued while offline. Safe to call more than once. */
  syncScans: (
    eventId: string,
    scans: { clientScanId: string; token: string; scannedAt: string; stationId?: string }[],
  ) =>
    request<{ results: SyncResult[] }>(`/api/events/${eventId}/check-in/sync`, {
      method: 'POST',
      body: json({ scans }),
      timeoutMs: 20_000,
    }),
  stats: (eventId: string) => request<StatsResponse>(`/api/events/${eventId}/stats`),
  /** Plain URL — the browser downloads it directly, cookie and all. */
  exportUrl: (eventId: string) => `${BASE_URL}/api/events/${eventId}/export.csv`,
};
