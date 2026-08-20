import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { eventStatus } from '../../lib/format';
import { Button, EmptyState, ErrorState, LoadingState } from '../../components/ui';
import { EventCard } from '../../components/EventCard';

export function OrganizerEvents() {
  // The API already scopes this to the signed-in organizer's own events.
  const events = useAsync(() => api.listEvents().then((r) => r.events), []);

  const mine = (events.data ?? []).slice().sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const active = mine.filter((e) => eventStatus(e) !== 'ended');
  const past = mine.filter((e) => eventStatus(e) === 'ended');

  return (
    <div className="page">
      <div className="pagehead">
        <div className="pagehead__title">
          <h1>Your events</h1>
          <p className="muted">Everything you’re running.</p>
        </div>
        <Link to="/organizer/events/new">
          <Button variant="primary">Create event</Button>
        </Link>
      </div>

      {events.loading ? (
        <LoadingState label="Loading your events…" />
      ) : events.error ? (
        <ErrorState
          title="We couldn’t load your events"
          body={events.error.message}
          action={<Button onClick={events.reload}>Try again</Button>}
        />
      ) : mine.length === 0 ? (
        <EmptyState
          title="No events yet"
          body="Create one and you’ll get a registration page and a scanner straight away."
          action={
            <Link to="/organizer/events/new">
              <Button variant="primary">Create event</Button>
            </Link>
          }
        />
      ) : (
        <>
          <div className="cardgrid">
            {active.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                to={`/organizer/events/${event.id}`}
                footer={
                  <div className="row" style={{ gap: 8 }}>
                    <Link to={`/organizer/events/${event.id}/scan`}>
                      <Button size="sm">Scan</Button>
                    </Link>
                    <Link to={`/organizer/events/${event.id}/dashboard`}>
                      <Button size="sm" variant="primary">
                        Dashboard
                      </Button>
                    </Link>
                  </div>
                }
              />
            ))}
          </div>

          {past.length > 0 && (
            <section className="section">
              <div className="section__head">
                <h3>Past events</h3>
              </div>
              <div className="cardgrid">
                {past.map((event) => (
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
            </section>
          )}
        </>
      )}
    </div>
  );
}
