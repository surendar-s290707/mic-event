/**
 * Tiny API client. Everything that talks to the backend goes through here so
 * there is exactly one place that knows the base URL and the error shape.
 *
 * Development: base URL is empty and Vite proxies /api to the Express server.
 * Production:  set VITE_API_BASE_URL to the deployed API origin.
 */

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const { timeoutMs = 8000, ...init } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...init.headers },
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new ApiError(body?.message ?? `Request failed (${response.status})`, response.status);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export interface HealthResponse {
  status: string;
  service: string;
  message: string;
  version: string;
  environment: string;
  uptimeSeconds: number;
  timestamp: string;
}

export function getHealth(): Promise<HealthResponse> {
  return apiFetch<HealthResponse>('/api/health', { timeoutMs: 4000 });
}
