import { Link } from 'react-router-dom';
import { useSession } from '../../store/session';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { eventStatus, formatDay, formatTime, greeting } from '../../lib/format';
import { Badge, Button, Card, EmptyState, ErrorState, LoadingState } from '../../components/ui';
import { EventCard } from '../../components/EventCard';

export function AttendeeHome() {
  const { user } = useSession();
  const events = useAsync(() => api.listEvents().then((r) => r.events), []);

  if (events.loading) {
    return (
      <div className="page">
        <LoadingState label="Loading events…" />
      </div>
    );
  }

  if (events.error) {
    return (
      <div className="page">
        <ErrorState
          title="We couldn’t load events"
          body={events.error.message}
          action={<Button onClick={events.reload}>Try again</Button>}
        />
      </div>
    );
  }

  const upcoming = (events.data ?? [])
    .filter((event) => eventStatus(event) !== 'ended')
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  const registered = upcoming.filter((event) => event.myRegistration);
  const discover = upcoming.filter((event) => !event.myRegistration);
  const next = registered[0];

  return (
    <div className="page">
      <div className="pagehead">
        <div className="pagehead__title">
          <h1>
            {greeting()}, {user?.name.split(' ')[0]}
          </h1>
          <p className="muted">
            {next ? 'Your ticket is ready whenever you are.' : 'Nothing booked yet — here’s what’s on.'}
          </p>
        </div>
      </div>

      {next && next.myRegistration && (
        <Card>
          <div className="feature">
            <div className="spread">
              <div>
                <p className="eyebrow">Your next event</p>
                <h2 style={{ marginTop: 4 }}>{next.name}</h2>
              </div>
              <Badge tone={next.myRegistration.checkedIn ? 'success' : 'accent'}>
                {next.myRegistration.checkedIn ? 'Checked in' : 'Registered'}
              </Badge>
            </div>

            <div className="feature__meta">
              <span className="meta-item">
                {formatDay(next.startsAt)}, {formatTime(next.startsAt)}
              </span>
              <span className="meta-item">·</span>
              <span className="meta-item">{next.venue}</span>
            </div>

            <div className="feature__actions">
              <Link to={`/attendee/ticket/${next.myRegistration.id}`}>
                <Button variant="primary">My ticket</Button>
              </Link>
              <Link to={`/attendee/events/${next.id}`}>
                <Button variant="ghost">Event details</Button>
              </Link>
            </div>
          </div>
        </Card>
      )}

      <section className="section">
        <div className="section__head">
          <h3>You’re going to</h3>
          <span className="muted" style={{ fontSize: '0.86rem' }}>
            {registered.length} event{registered.length === 1 ? '' : 's'}
          </span>
        </div>
        {registered.length === 0 ? (
          <EmptyState title="No tickets yet" body="Register for something below and your QR shows up here." />
        ) : (
          <div className="cardgrid">
            {registered.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                to={`/attendee/events/${event.id}`}
                rightSlot={
                  <Badge tone={event.myRegistration!.checkedIn ? 'success' : 'accent'}>
                    {event.myRegistration!.checkedIn ? 'Checked in' : 'Registered'}
                  </Badge>
                }
                footer={
                  <Link to={`/attendee/ticket/${event.myRegistration!.id}`}>
                    <Button size="sm" variant="primary">
                      My ticket
                    </Button>
                  </Link>
                }
              />
            ))}
          </div>
        )}
      </section>

      <section className="section">
        <div className="section__head">
          <h3>Happening on campus</h3>
          <Link to="/attendee/events" className="muted" style={{ fontSize: '0.88rem' }}>
            See all
          </Link>
        </div>
        {discover.length === 0 ? (
          <EmptyState title="Nothing new right now" body="Check back when the clubs post their next thing." />
        ) : (
          <div className="cardgrid">
            {discover.slice(0, 3).map((event) => (
              <EventCard
                key={event.id}
                event={event}
                to={`/attendee/events/${event.id}`}
                footer={
                  <Link to={`/attendee/events/${event.id}`}>
                    <Button size="sm" disabled={event.spotsLeft === 0}>
                      {event.spotsLeft === 0 ? 'Full' : 'Register'}
                    </Button>
                  </Link>
                }
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
