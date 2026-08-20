import { useEffect, useState } from 'react';
import { api, type HealthResponse } from '../lib/api';

type Status = 'checking' | 'online' | 'offline' | 'degraded';

/**
 * Unobtrusive status indicator: can the browser reach the API, and can the API
 * reach its database? It re-checks every 20s, so starting the server or the
 * database becomes visible without a page reload.
 */
export function ApiStatus() {
  const [status, setStatus] = useState<Status>('checking');
  const [health, setHealth] = useState<HealthResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const result = await api.health();
        if (cancelled) return;
        setHealth(result);
        setStatus(result.database === 'up' ? 'online' : 'degraded');
      } catch {
        if (cancelled) return;
        setHealth(null);
        setStatus('offline');
      }
    }

    void check();
    const timer = setInterval(check, 20_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const label =
    status === 'online'
      ? 'API online'
      : status === 'degraded'
        ? 'No database'
        : status === 'offline'
          ? 'API offline'
          : 'Checking API';

  const title =
    status === 'online' && health
      ? `${health.service} v${health.version} · ${health.environment} · database up`
      : status === 'degraded'
        ? 'The API is running but cannot reach PostgreSQL. Try: npm run db:up'
        : status === 'offline'
          ? 'Cannot reach /api/health — start the server with: npm run server'
          : 'Contacting /api/health…';

  return (
    <span
      className={`apistatus apistatus--${status === 'degraded' ? 'checking' : status}`}
      title={title}
      aria-live="polite"
    >
      <span className="apistatus__dot" aria-hidden="true" />
      <span className="apistatus__text">{label}</span>
    </span>
  );
}
