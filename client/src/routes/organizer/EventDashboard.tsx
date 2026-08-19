import { Link, useParams } from 'react-router-dom';
import { useApp } from '../../store/context';
import type { CheckIn } from '../../lib/types';
import { formatTime, timeAgo } from '../../lib/format';
import { Badge, Button, Card, DevNote, EmptyState, ErrorState, Progress, Stat } from '../../components/ui';

/** Groups check-ins into 15-minute buckets for the little CSS bar chart. */
function buildBuckets(checkIns: CheckIn[], buckets = 8, minutesPerBucket = 15) {
  const now = Date.now();
  const windowMs = buckets * minutesPerBucket * 60_000;
  const start = now - windowMs;

  const counts = new Array(buckets).fill(0) as number[];
  for (const checkIn of checkIns) {
    const time = new Date(checkIn.checkedInAt).getTime();
    if (time < start || time > now) continue;
    const index = Math.min(buckets - 1, Math.floor((time - start) / (minutesPerBucket * 60_000)));
    counts[index] += 1;
  }

  return counts.map((count, index) => ({
    count,
    label: formatTime(new Date(start + index * minutesPerBucket * 60_000)).replace(/\s?[ap]m/, ''),
  }));
}

export function EventDashboard() {
  const { id = '' } = useParams();
  const { getEvent, getStats, getCheckInsFor } = useApp();

  const event = getEvent(id);
  if (!event) {
    return (
      <div className="page">
        <ErrorState
          title="We couldn’t find that event"
          body="Open the event from your dashboard and try again."
          action={
            <Link to="/organizer/events">
              <Button>Back to events</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const stats = getStats(event.id);
  const checkIns = getCheckInsFor(event.id);
  const buckets = buildBuckets(checkIns);
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
        </div>
        <div className="row">
          <Link to={`/organizer/events/${event.id}/scan`}>
            <Button variant="primary">Scan QR</Button>
          </Link>
          <Link to={`/organizer/events/${event.id}`}>
            <Button variant="ghost">Event page</Button>
          </Link>
        </div>
      </div>

      <div className="grid-2">
        <div className="stack" style={{ gap: 20 }}>
          <Card>
            <div className="stat-grid">
              <Stat value={stats.registered} label="Registered" />
              <Stat value={stats.checkedIn} label="Checked in" />
              <Stat value={stats.spotsLeft} label="Spots left" />
              <Stat value={`${stats.attendancePercent}%`} label="Turnout" />
            </div>
            <div className="stack" style={{ gap: 8, marginTop: 20 }}>
              <div className="spread">
                <span className="muted" style={{ fontSize: '0.88rem' }}>
                  Attendance
                </span>
                <span className="muted" style={{ fontSize: '0.88rem' }}>
                  {stats.checkedIn} of {stats.registered} registered
                </span>
              </div>
              <Progress value={stats.checkedIn} max={stats.registered} complete={stats.checkedIn === stats.registered} />
            </div>
          </Card>

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
              {checkIns.length}
            </Badge>
          </div>
          {checkIns.length === 0 ? (
            <EmptyState title="Nobody scanned in yet" body="Names appear here as people come through the door." />
          ) : (
            <div className="list" style={{ maxHeight: 420, overflowY: 'auto' }}>
              {checkIns.slice(0, 25).map((checkIn) => (
                <div className="list__row" key={checkIn.id}>
                  <div className="list__main">
                    <div className="list__name">{checkIn.attendeeName}</div>
                    <div className="list__meta">
                      {formatTime(checkIn.checkedInAt)} · {timeAgo(checkIn.checkedInAt)}
                    </div>
                  </div>
                  {checkIn.method !== 'SCAN' && <Badge tone="outline">{checkIn.method.toLowerCase()}</Badge>}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div style={{ marginTop: 20 }}>
        <DevNote>
          This page re-renders from local state. With the real backend it subscribes to a Socket.IO
          room for the event, so every scanner updates it without a refresh.
        </DevNote>
      </div>
    </div>
  );
}
