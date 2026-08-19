import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useApp } from '../store/context';
import { eventStatus, formatDay, formatTime, statusLabel } from '../lib/format';
import { Badge, Banner, Button, Card, DevNote, ErrorState, Progress, Stat } from '../components/ui';

/**
 * One event page for both roles. The data shown is the same; the actions are
 * not — which is exactly how the API will be split later (organizer-only
 * endpoints for scanning and export, attendee-only for registering).
 */
export function EventDetail() {
  const { id = '' } = useParams();
  const location = useLocation();
  const { user, getEvent, getStats, getOrganizer, getMyRegistration, registerForEvent, isCheckedIn } = useApp();

  const [notice, setNotice] = useState<{ tone: 'success' | 'error' | 'warn' | 'info'; text: string } | null>(
    (location.state as { created?: boolean } | null)?.created
      ? { tone: 'success', text: 'Event created. Share it and start collecting registrations.' }
      : null,
  );

  const event = getEvent(id);
  if (!event) {
    return (
      <div className="page">
        <ErrorState
          title="We couldn’t find that event"
          body="It may have been removed, or the link is wrong."
          action={
            <Link to={user?.role === 'ORGANIZER' ? '/organizer/events' : '/attendee/events'}>
              <Button>Back to events</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const isOrganizer = user?.role === 'ORGANIZER';
  const stats = getStats(event.id);
  const status = eventStatus(event);
  const organizer = getOrganizer(event.organizerId);
  const myRegistration = getMyRegistration(event.id);
  const checkedIn = myRegistration ? isCheckedIn(myRegistration.id) : false;

  function onRegister() {
    const result = registerForEvent(event!.id);
    if (result.ok) {
      setNotice({ tone: 'success', text: 'You’re registered. Your ticket is ready below.' });
    } else if (result.reason === 'event_full') {
      setNotice({ tone: 'error', text: 'This event just filled up — no seats left.' });
    } else if (result.reason === 'already_registered') {
      setNotice({ tone: 'warn', text: 'You’re already registered for this one.' });
    } else {
      setNotice({ tone: 'error', text: 'Log in as an attendee to register.' });
    }
  }

  return (
    <div className="page">
      <div className="pagehead">
        <div className="pagehead__title">
          <div className="row" style={{ gap: 10 }}>
            <Badge tone={status === 'live' ? 'success' : status === 'ended' ? 'neutral' : 'outline'} dot={status === 'live'}>
              {statusLabel[status]}
            </Badge>
            {organizer && <span className="muted" style={{ fontSize: '0.88rem' }}>by {organizer.name}</span>}
          </div>
          <h1>{event.name}</h1>
          <div className="feature__meta">
            <span className="meta-item">
              {formatDay(event.startsAt)}, {formatTime(event.startsAt)} – {formatTime(event.endsAt)}
            </span>
            <span className="meta-item">·</span>
            <span className="meta-item">{event.venue}</span>
          </div>
        </div>
      </div>

      {notice && (
        <div style={{ marginBottom: 20 }}>
          <Banner tone={notice.tone}>{notice.text}</Banner>
        </div>
      )}

      <div className="grid-2">
        <div className="stack" style={{ gap: 20 }}>
          {event.description && (
            <Card>
              <h3 style={{ marginBottom: 8 }}>About</h3>
              <p className="subtle">{event.description}</p>
            </Card>
          )}

          <Card>
            <div className="stat-grid">
              <Stat value={`${stats.registered} / ${stats.capacity}`} label="Registered" />
              {isOrganizer ? (
                <Stat value={stats.checkedIn} label="Checked in" />
              ) : (
                <Stat value={stats.spotsLeft} label="Seats left" />
              )}
              <Stat value={`${stats.attendancePercent}%`} label="Attendance" />
            </div>
            <div style={{ marginTop: 16 }}>
              <Progress value={stats.checkedIn} max={stats.registered} />
            </div>
          </Card>
        </div>

        <div className="stack" style={{ gap: 20 }}>
          <Card>
            <h3 style={{ marginBottom: 12 }}>{isOrganizer ? 'Run this event' : 'Your spot'}</h3>

            {isOrganizer ? (
              <OrganizerActions eventId={event.id} onExport={() => setNotice({
                tone: 'info',
                text: 'CSV export lands with the real backend — the button is here so the flow is settled.',
              })} />
            ) : (
              <AttendeeActions
                registered={Boolean(myRegistration)}
                registrationId={myRegistration?.id}
                checkedIn={checkedIn}
                soldOut={stats.spotsLeft === 0}
                ended={status === 'ended'}
                onRegister={onRegister}
              />
            )}
          </Card>

          <DevNote>
            Counts come from mock data in the browser. They become live database numbers, pushed over
            Socket.IO, in a later milestone.
          </DevNote>
        </div>
      </div>
    </div>
  );
}

function OrganizerActions({ eventId, onExport }: { eventId: string; onExport: () => void }) {
  return (
    <div className="stack" style={{ gap: 10 }}>
      <Link to={`/organizer/events/${eventId}/scan`}>
        <Button variant="primary" block>
          Scan QR
        </Button>
      </Link>
      <Link to={`/organizer/events/${eventId}/dashboard`}>
        <Button block>Live dashboard</Button>
      </Link>
      {/* Placeholder: real CSV export needs the database behind it. */}
      <Button block variant="ghost" onClick={onExport}>
        Export attendance (soon)
      </Button>
    </div>
  );
}

function AttendeeActions({
  registered,
  registrationId,
  checkedIn,
  soldOut,
  ended,
  onRegister,
}: {
  registered: boolean;
  registrationId?: string;
  checkedIn: boolean;
  soldOut: boolean;
  ended: boolean;
  onRegister: () => void;
}) {
  if (registered) {
    return (
      <div className="stack" style={{ gap: 12 }}>
        <div className="row">
          <Badge tone={checkedIn ? 'success' : 'accent'}>{checkedIn ? 'Checked in' : 'Registered'}</Badge>
          <span className="muted" style={{ fontSize: '0.88rem' }}>
            {checkedIn ? 'You’re inside. Enjoy.' : 'Show your ticket at the entrance.'}
          </span>
        </div>
        <Link to={`/attendee/ticket/${registrationId}`}>
          <Button variant="primary" block>
            My ticket
          </Button>
        </Link>
        <Link to={`/attendee/events`}>
          <Button variant="ghost" block>
            Browse other events
          </Button>
        </Link>
      </div>
    );
  }

  if (ended) {
    return <p className="muted">This event has finished.</p>;
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      <p className="muted" style={{ fontSize: '0.9rem' }}>
        {soldOut ? 'Every seat is taken for this one.' : 'One tap and your QR ticket is ready.'}
      </p>
      <Button variant="primary" block disabled={soldOut} onClick={onRegister}>
        {soldOut ? 'Event full' : 'Register'}
      </Button>
    </div>
  );
}
