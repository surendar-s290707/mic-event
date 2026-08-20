import { Link } from 'react-router-dom';
import { useSession } from '../../store/session';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { eventStatus, formatDay, formatTime, greeting, statusLabel, timeAgo } from '../../lib/format';
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
import { EventCard } from '../../components/EventCard';

export function OrganizerHome() {
  const { user } = useSession();
  const events = useAsync(() => api.listEvents().then((r) => r.events), []);

  // The featured event's live numbers come from the stats endpoint, so the
  // recent check-in list is the database's, not a guess.
  const mine = (events.data ?? []).slice().sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const featured =
    mine.find((e) => eventStatus(e) === 'live') ?? mine.find((e) => eventStatus(e) !== 'ended') ?? mine[0];
  const upcoming = mine.filter((e) => e.id !== featured?.id && eventStatus(e) !== 'ended');

  const detail = useAsync(
    () => (featured ? api.stats(featured.id) : Promise.resolve(null)),
    [featured?.id],
  );

  if (events.loading) {
    return (
      <div className="page">
        <LoadingState label="Loading your events…" />
      </div>
    );
  }

  if (events.error) {
    return (
      <div className="page">
        <ErrorState
          title="We couldn’t load your events"
          body={events.error.message}
          action={<Button onClick={events.reload}>Try again</Button>}
        />
      </div>
    );
  }

  if (!featured) {
    return (
      <div className="page">
        <h1>
          {greeting()}, {user?.name.split(' ')[0]}
        </h1>
        <div style={{ marginTop: 24 }}>
          <EmptyState
            title="No events yet"
            body="Create your first event and share it with your club."
            action={
              <Link to="/organizer/events/new">
                <Button variant="primary">Create event</Button>
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  const status = eventStatus(featured);
  const stats = detail.data?.stats;
  const recent = detail.data?.recentCheckIns.slice(0, 6) ?? [];
  const registered = stats?.registeredCount ?? featured.registeredCount;
  const checkedIn = stats?.checkedInCount ?? featured.checkedInCount ?? 0;

  return (
    <div className="page">
      <div className="pagehead">
        <div className="pagehead__title">
          <h1>
            {greeting()}, {user?.name.split(' ')[0]}
          </h1>
          <p className="muted">
            {status === 'live'
              ? 'Doors are open — here’s how it’s going.'
              : 'Here’s what’s coming up for your club.'}
          </p>
        </div>
        <Link to="/organizer/events/new">
          <Button variant="primary">Create event</Button>
        </Link>
      </div>

      <div className="grid-2">
        <div className="stack" style={{ gap: 24 }}>
          <Card>
            <div className="feature">
              <div className="spread">
                <div>
                  <p className="eyebrow">{status === 'live' ? 'Happening now' : 'Next up'}</p>
                  <h2 style={{ marginTop: 4 }}>{featured.name}</h2>
                </div>
                <Badge tone={status === 'live' ? 'success' : 'outline'} dot={status === 'live'}>
                  {statusLabel[status]}
                </Badge>
              </div>

              <div className="feature__meta">
                <span className="meta-item">
                  {formatDay(featured.startsAt)}, {formatTime(featured.startsAt)}
                </span>
                <span className="meta-item">·</span>
                <span className="meta-item">{featured.venue}</span>
                <span className="meta-item">·</span>
                <span className="meta-item">{featured.capacity} seats</span>
              </div>

              <div className="stack" style={{ gap: 8 }}>
                <div className="spread">
                  <strong>
                    {checkedIn} / {registered} checked in
                  </strong>
                  <span className="muted" style={{ fontSize: '0.88rem' }}>
                    {registered} of {featured.capacity} seats taken
                  </span>
                </div>
                <Progress value={checkedIn} max={registered} />
              </div>

              <div className="feature__actions">
                <Link to={`/organizer/events/${featured.id}/scan`}>
                  <Button variant="primary">Scan QR</Button>
                </Link>
                <Link to={`/organizer/events/${featured.id}/dashboard`}>
                  <Button>Live dashboard</Button>
                </Link>
                <Link to={`/organizer/events/${featured.id}`}>
                  <Button variant="ghost">View event</Button>
                </Link>
              </div>
            </div>
          </Card>

          <section>
            <div className="section__head">
              <h3>Upcoming events</h3>
              <Link to="/organizer/events" className="muted" style={{ fontSize: '0.88rem' }}>
                See all
              </Link>
            </div>
            {upcoming.length === 0 ? (
              <EmptyState title="Nothing else scheduled" body="When you create an event it shows up here." />
            ) : (
              <div className="cardgrid">
                {upcoming.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    to={`/organizer/events/${event.id}`}
                    footer={
                      <Link to={`/organizer/events/${event.id}`}>
                        <Button size="sm">Open</Button>
                      </Link>
                    }
                  />
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="stack" style={{ gap: 24 }}>
          <Card>
            <div className="stat-grid">
              <Stat value={registered} label="Registered" />
              <Stat value={checkedIn} label="Checked in" />
              <Stat value={stats?.spotsLeft ?? featured.spotsLeft} label="Spots left" />
            </div>
          </Card>

          <Card>
            <div className="spread" style={{ marginBottom: 12 }}>
              <h3>Recent check-ins</h3>
              <Link
                to={`/organizer/events/${featured.id}/dashboard`}
                className="muted"
                style={{ fontSize: '0.84rem' }}
              >
                All
              </Link>
            </div>
            {detail.loading ? (
              <LoadingState label="Loading check-ins…" />
            ) : recent.length === 0 ? (
              <EmptyState title="No one has scanned in yet" body="Check-ins appear here as they happen." />
            ) : (
              <div className="list">
                {recent.map((checkIn) => (
                  <div className="list__row" key={checkIn.id}>
                    <div className="list__main">
                      <div className="list__name">{checkIn.name}</div>
                      <div className="list__meta">{timeAgo(checkIn.checkedInAt)}</div>
                    </div>
                    <Badge tone="success">In</Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
