import { useEffect, useState } from 'react';
import { getHealth, type HealthResponse } from '../lib/api';

type Status = 'checking' | 'online' | 'offline';

/**
 * Unobtrusive development indicator: does the browser actually reach the
 * Express server? It re-checks every 20s so starting the API is visible
 * without a page reload.
 */
export function ApiStatus() {
  const [status, setStatus] = useState<Status>('checking');
  const [health, setHealth] = useState<HealthResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const result = await getHealth();
        if (cancelled) return;
        setHealth(result);
        setStatus(result.status === 'ok' ? 'online' : 'offline');
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

  const label = status === 'online' ? 'API online' : status === 'offline' ? 'API offline' : 'Checking API';
  const title =
    status === 'online' && health
      ? `${health.service} v${health.version} · ${health.environment} · up ${health.uptimeSeconds}s`
      : status === 'offline'
        ? 'Cannot reach /api/health — start the server with: npm run server'
        : 'Contacting /api/health…';

  return (
    <span className={`apistatus apistatus--${status}`} title={title} aria-live="polite">
      <span className="apistatus__dot" aria-hidden="true" />
      <span className="apistatus__text">{label}</span>
    </span>
  );
}
