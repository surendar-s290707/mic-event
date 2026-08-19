import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../../store/context';
import { eventStatus } from '../../lib/format';
import { Badge, Banner, Button, EmptyState } from '../../components/ui';
import { EventCard } from '../../components/EventCard';

export function AttendeeEvents() {
  const { events, getStats, getMyRegistration, isCheckedIn, registerForEvent } = useApp();
  const [notice, setNotice] = useState<{ tone: 'success' | 'error' | 'warn'; text: string } | null>(null);

  const upcoming = events
    .filter((event) => eventStatus(event) !== 'ended')
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  function onRegister(eventId: string, eventName: string) {
    const result = registerForEvent(eventId);
    if (result.ok) setNotice({ tone: 'success', text: `You’re in for ${eventName}. Your ticket is ready.` });
    else if (result.reason === 'event_full') setNotice({ tone: 'error', text: 'That one just filled up.' });
    else if (result.reason === 'already_registered')
      setNotice({ tone: 'warn', text: 'You’re already registered for that.' });
    else setNotice({ tone: 'error', text: 'Log in as an attendee to register.' });
  }

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

      {upcoming.length === 0 ? (
        <EmptyState title="No events scheduled" body="When a club posts something new it shows up here." />
      ) : (
        <div className="cardgrid">
          {upcoming.map((event) => {
            const stats = getStats(event.id);
            const registration = getMyRegistration(event.id);
            const checkedIn = registration ? isCheckedIn(registration.id) : false;

            return (
              <EventCard
                key={event.id}
                event={event}
                stats={stats}
                to={`/attendee/events/${event.id}`}
                rightSlot={
                  registration ? (
                    <Badge tone={checkedIn ? 'success' : 'accent'}>
                      {checkedIn ? 'Checked in' : 'Registered'}
                    </Badge>
                  ) : stats.spotsLeft === 0 ? (
                    <Badge tone="danger">Full</Badge>
                  ) : (
                    <Badge tone="outline">{stats.spotsLeft} seats left</Badge>
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
                      disabled={stats.spotsLeft === 0}
                      onClick={() => onRegister(event.id, event.name)}
                    >
                      {stats.spotsLeft === 0 ? 'Full' : 'Register'}
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
