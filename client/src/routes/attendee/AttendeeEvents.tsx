import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { eventStatus } from '../../lib/format';
import { Badge, Banner, Button, EmptyState, ErrorState, LoadingState } from '../../components/ui';
import { EventCard } from '../../components/EventCard';

export function AttendeeEvents() {
  const events = useAsync(() => api.listEvents().then((r) => r.events), []);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error' | 'warn'; text: string } | null>(null);
  const [registeringId, setRegisteringId] = useState<string | null>(null);

  async function onRegister(eventId: string, eventName: string) {
    setRegisteringId(eventId);
    setNotice(null);
    try {
      await api.register(eventId);
      await events.reload();
      setNotice({ tone: 'success', text: `You’re in for ${eventName}. Your ticket is ready.` });
    } catch (error) {
      const code = error instanceof ApiError ? error.code : 'error';
      setNotice({
        tone: code === 'already_registered' ? 'warn' : 'error',
        text: error instanceof Error ? error.message : 'We couldn’t register you.',
      });
      // Someone else may have taken the last seat — show the real numbers.
      await events.reload();
    } finally {
      setRegisteringId(null);
    }
  }

  const upcoming = (events.data ?? [])
    .filter((event) => eventStatus(event) !== 'ended')
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  return (
    <div className="page">
      <div className="pagehead">
        <div className="pagehead__title">
          <h1>Upcoming events</h1>
          <p className="muted">Everything the clubs have coming up.</p>
        </div>
      </div>

      {notice && (
        <div style={{ marginBottom: 20 }}>
          <Banner tone={notice.tone}>{notice.text}</Banner>
        </div>
      )}

      {events.loading ? (
        <LoadingState label="Loading events…" />
      ) : events.error ? (
        <ErrorState
          title="We couldn’t load events"
          body={events.error.message}
          action={<Button onClick={events.reload}>Try again</Button>}
        />
      ) : upcoming.length === 0 ? (
        <EmptyState title="No events scheduled" body="When a club posts something new it shows up here." />
      ) : (
        <div className="cardgrid">
          {upcoming.map((event) => {
            const registration = event.myRegistration;
            return (
              <EventCard
                key={event.id}
                event={event}
                to={`/attendee/events/${event.id}`}
                rightSlot={
                  registration ? (
                    <Badge tone={registration.checkedIn ? 'success' : 'accent'}>
                      {registration.checkedIn ? 'Checked in' : 'Registered'}
                    </Badge>
                  ) : event.spotsLeft === 0 ? (
                    <Badge tone="danger">Full</Badge>
                  ) : (
                    <Badge tone="outline">{event.spotsLeft} seats left</Badge>
                  )
                }
                footer={
                  registration ? (
                    <Link to={`/attendee/ticket/${registration.id}`}>
                      <Button size="sm" variant="primary">
                        My ticket
                      </Button>
                    </Link>
                  ) : (
                    <Button
                      size="sm"
                      variant="primary"
                      loading={registeringId === event.id}
                      disabled={event.spotsLeft === 0}
                      onClick={() => onRegister(event.id, event.name)}
                    >
                      {event.spotsLeft === 0 ? 'Full' : 'Register'}
                    </Button>
                  )
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
