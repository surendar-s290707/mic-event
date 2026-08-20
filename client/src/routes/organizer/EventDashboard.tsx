import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { getSocket, type LiveCheckIn } from '../../lib/socket';
import { InsightsCard } from '../../components/InsightsCard';
import { useAsync } from '../../lib/useAsync';
import { formatTime, timeAgo } from '../../lib/format';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Progress,
  Stat,
} from '../../components/ui';

/** Groups arrival timestamps into 15-minute buckets for the CSS bar chart. */
function buildBuckets(arrivals: string[], buckets = 8, minutesPerBucket = 15) {
  const now = Date.now();
  const start = now - buckets * minutesPerBucket * 60_000;

  const counts = new Array(buckets).fill(0) as number[];
  for (const iso of arrivals) {
    const time = new Date(iso).getTime();
    if (time < start || time > now) continue;
    counts[Math.min(buckets - 1, Math.floor((time - start) / (minutesPerBucket * 60_000)))] += 1;
  }

  return counts.map((count, index) => ({
    count,
    label: formatTime(new Date(start + index * minutesPerBucket * 60_000)).replace(/\s?[ap]m/, ''),
  }));
}

/**
 * Fallback polling interval, used only while the socket is disconnected —
 * a blocked WebSocket should degrade to a slow dashboard, not a frozen one.
 */
const FALLBACK_REFRESH_MS = 15_000;

export function EventDashboard() {
  const { id = '' } = useParams();

  const eventRequest = useAsync(() => api.getEvent(id).then((r) => r.event), [id]);
  const statsRequest = useAsync(() => api.stats(id), [id]);
  const reloadStats = statsRequest.reload;
  const [live, setLive] = useState(false);
  const [lastArrival, setLastArrival] = useState<LiveCheckIn | null>(null);

  /**
   * Live updates. The server emits into a room for this event whenever a
   * check-in commits; the dashboard treats that as "your numbers are stale"
   * and re-reads /stats, so the socket never becomes a second, divergent way
   * of computing the same figures.
   */
  useEffect(() => {
    if (!id) return;
    const socket = getSocket();

    const join = () => socket.emit('join-event', id, (result: { ok: boolean }) => setLive(Boolean(result?.ok)));

    const onCheckIn = (payload: LiveCheckIn) => {
      if (payload.eventId !== id) return;
      setLastArrival(payload);
      void reloadStats();
    };

    if (socket.connected) join();
    socket.on('connect', join);
    socket.on('check-in', onCheckIn);
    socket.on('disconnect', () => setLive(false));

    return () => {
      socket.emit('leave-event', id);
      socket.off('connect', join);
      socket.off('check-in', onCheckIn);
    };
  }, [id, reloadStats]);

  // Safety net: if the socket is down (blocked proxy, server restart), fall
  // back to slow polling rather than showing stale numbers forever.
  useEffect(() => {
    if (live) return;
    const timer = setInterval(() => void reloadStats(), FALLBACK_REFRESH_MS);
    return () => clearInterval(timer);
  }, [live, reloadStats]);

  if (eventRequest.loading || (statsRequest.loading && !statsRequest.data)) {
    return (
      <div className="page">
        <LoadingState label="Loading dashboard…" />
      </div>
    );
  }

  const error = eventRequest.error ?? statsRequest.error;
  if (error || !eventRequest.data) {
    return (
      <div className="page">
        <ErrorState
          title={error?.status === 403 ? 'That event isn’t yours' : 'We couldn’t load the dashboard'}
          body={error?.message ?? 'Open the event from your dashboard and try again.'}
          action={
            <Link to="/organizer/events">
              <Button>Back to events</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const event = eventRequest.data;
  const stats = statsRequest.data?.stats;
  const checkIns = statsRequest.data?.recentCheckIns ?? [];
  const buckets = buildBuckets(statsRequest.data?.arrivals ?? []);
  const peak = Math.max(1, ...buckets.map((b) => b.count));

  return (
    <div className="page">
      <div className="pagehead">
        <div className="pagehead__title">
          <p className="eyebrow">Live dashboard</p>
          <h1 style={{ fontSize: '1.8rem' }}>{event.name}</h1>
          <p className="muted">
            {event.venue} · doors {formatTime(event.startsAt)}
          </p>
          <div className="row" style={{ gap: 8, marginTop: 4 }}>
            <Badge tone={live ? 'success' : 'outline'} dot={live}>
              {live ? 'Live' : 'Reconnecting…'}
            </Badge>
            {lastArrival && (
              <span className="muted" style={{ fontSize: '0.84rem' }}>
                {lastArrival.attendeeName} just walked in
              </span>
            )}
          </div>
        </div>
        <div className="row">
          <Link to={`/organizer/events/${event.id}/scan`}>
            <Button variant="primary">Scan QR</Button>
          </Link>
          <a href={api.exportUrl(event.id)} download>
            <Button>Export CSV</Button>
          </a>
          <Link to={`/organizer/events/${event.id}`}>
            <Button variant="ghost">Event page</Button>
          </Link>
        </div>
      </div>

      <div className="grid-2">
        <div className="stack" style={{ gap: 20 }}>
          <Card>
            <div className="stat-grid">
              <Stat value={stats?.registeredCount ?? 0} label="Registered" />
              <Stat value={stats?.checkedInCount ?? 0} label="Checked in" />
              <Stat value={stats?.spotsLeft ?? 0} label="Spots left" />
              <Stat value={`${stats?.attendancePercent ?? 0}%`} label="Turnout" />
            </div>
            <div className="stack" style={{ gap: 8, marginTop: 20 }}>
              <div className="spread">
                <span className="muted" style={{ fontSize: '0.88rem' }}>
                  Attendance
                </span>
                <span className="muted" style={{ fontSize: '0.88rem' }}>
                  {stats?.checkedInCount ?? 0} of {stats?.registeredCount ?? 0} registered
                </span>
              </div>
              <Progress
                value={stats?.checkedInCount ?? 0}
                max={stats?.registeredCount ?? 0}
                complete={Boolean(stats && stats.checkedInCount === stats.registeredCount)}
              />
            </div>
          </Card>

          <InsightsCard eventId={event.id} />

          <Card>
            <div className="spread" style={{ marginBottom: 4 }}>
              <h3>Arrivals</h3>
              <span className="muted" style={{ fontSize: '0.84rem' }}>
                Last 2 hours, 15-minute blocks
              </span>
            </div>
            {/* Plain CSS bars — a chart library would be overkill for eight columns. */}
            <div className="bars">
              {buckets.map((bucket, index) => (
                <div className="bars__col" key={index}>
                  <div
                    className={`bars__bar ${bucket.count === 0 ? 'bars__bar--empty' : ''}`}
                    style={{ height: `${(bucket.count / peak) * 100}%` }}
                    title={`${bucket.count} check-ins around ${bucket.label}`}
                  />
                  <span className="bars__label">{bucket.label}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <Card>
          <div className="spread" style={{ marginBottom: 12 }}>
            <h3>Checked in</h3>
            <Badge tone="success" dot>
              {stats?.checkedInCount ?? 0}
            </Badge>
          </div>
          {checkIns.length === 0 ? (
            <EmptyState title="Nobody scanned in yet" body="Names appear here as people come through the door." />
          ) : (
            <div className="list" style={{ maxHeight: 420, overflowY: 'auto' }}>
              {checkIns.map((checkIn) => (
                <div className="list__row" key={checkIn.id}>
                  <div className="list__main">
                    <div className="list__name">{checkIn.name}</div>
                    <div className="list__meta">
                      {formatTime(checkIn.checkedInAt)} · {timeAgo(checkIn.checkedInAt)}
                    </div>
                  </div>
                  {checkIn.stationId && <Badge tone="outline">{checkIn.stationId}</Badge>}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
