import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useSession } from '../store/session';
import { ApiError, api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { eventStatus, formatDay, formatTime, statusLabel } from '../lib/format';
import {
  Badge,
  Banner,
  Button,
  Card,
  ErrorState,
  LoadingState,
  Progress,
  Stat,
} from '../components/ui';

type Notice = { tone: 'success' | 'error' | 'warn' | 'info'; text: string } | null;

/**
 * One event page for both roles. The data is the same; the actions are not —
 * and the API enforces that split, not this component.
 */
export function EventDetail() {
  const { id = '' } = useParams();
  const location = useLocation();
  const { user } = useSession();

  const [notice, setNotice] = useState<Notice>(
    (location.state as { created?: boolean } | null)?.created
      ? { tone: 'success', text: 'Event created. Share it and start collecting registrations.' }
      : null,
  );
  const [registering, setRegistering] = useState(false);

  const request = useAsync(() => api.getEvent(id).then((r) => r.event), [id]);
  const event = request.data;

  if (request.loading) {
    return (
      <div className="page">
        <LoadingState label="Loading event…" />
      </div>
    );
  }

  if (request.error || !event) {
    const notFound = request.error?.status === 404;
    return (
      <div className="page">
        <ErrorState
          title={notFound ? 'We couldn’t find that event' : 'We couldn’t load that event'}
          body={request.error?.message ?? 'It may have been removed, or the link is wrong.'}
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
  const status = eventStatus(event);
  const registration = event.myRegistration;

  async function onRegister() {
    setRegistering(true);
    setNotice(null);
    try {
      await api.register(event!.id);
      await request.reload();
      setNotice({ tone: 'success', text: 'You’re registered. Your ticket is ready below.' });
    } catch (error) {
      const code = error instanceof ApiError ? error.code : 'error';
      setNotice({
        tone: code === 'already_registered' ? 'warn' : 'error',
        text: error instanceof Error ? error.message : 'We couldn’t register you.',
      });
      if (code === 'already_registered' || code === 'event_full') await request.reload();
    } finally {
      setRegistering(false);
    }
  }

  return (
    <div className="page">
      <div className="pagehead">
        <div className="pagehead__title">
          <div className="row" style={{ gap: 10 }}>
            <Badge
              tone={status === 'live' ? 'success' : status === 'ended' ? 'neutral' : 'outline'}
              dot={status === 'live'}
            >
              {statusLabel[status]}
            </Badge>
            <span className="muted" style={{ fontSize: '0.88rem' }}>
              by {event.organizer.name}
            </span>
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
              <Stat value={`${event.registeredCount} / ${event.capacity}`} label="Registered" />
              {isOrganizer ? (
                <Stat value={event.checkedInCount ?? 0} label="Checked in" />
              ) : (
                <Stat value={event.spotsLeft} label="Seats left" />
              )}
              {isOrganizer && (
                <Stat
                  value={`${
                    event.registeredCount === 0
                      ? 0
                      : Math.round(((event.checkedInCount ?? 0) / event.registeredCount) * 100)
                  }%`}
                  label="Attendance"
                />
              )}
            </div>
            {isOrganizer && (
              <div style={{ marginTop: 16 }}>
                <Progress value={event.checkedInCount ?? 0} max={event.registeredCount} />
              </div>
            )}
          </Card>
        </div>

        <div className="stack" style={{ gap: 20 }}>
          <Card>
            <h3 style={{ marginBottom: 12 }}>{isOrganizer ? 'Run this event' : 'Your spot'}</h3>

            {isOrganizer ? (
              <div className="stack" style={{ gap: 10 }}>
                <Link to={`/organizer/events/${event.id}/scan`}>
                  <Button variant="primary" block>
                    Scan QR
                  </Button>
                </Link>
                <Link to={`/organizer/events/${event.id}/dashboard`}>
                  <Button block>Live dashboard</Button>
                </Link>
                {/* Plain link: the browser sends the session cookie and saves the file. */}
                <a href={api.exportUrl(event.id)} download>
                  <Button block variant="ghost">
                    Export attendance (CSV)
                  </Button>
                </a>
              </div>
            ) : registration ? (
              <div className="stack" style={{ gap: 12 }}>
                <div className="row">
                  <Badge tone={registration.checkedIn ? 'success' : 'accent'}>
                    {registration.checkedIn ? 'Checked in' : 'Registered'}
                  </Badge>
                  <span className="muted" style={{ fontSize: '0.88rem' }}>
                    {registration.checkedIn
                      ? `You’re inside — scanned at ${formatTime(registration.checkedInAt!)}.`
                      : 'Show your ticket at the entrance.'}
                  </span>
                </div>
                <Link to={`/attendee/ticket/${registration.id}`}>
                  <Button variant="primary" block>
                    My ticket
                  </Button>
                </Link>
                <Link to="/attendee/events">
                  <Button variant="ghost" block>
                    Browse other events
                  </Button>
                </Link>
              </div>
            ) : status === 'ended' ? (
              <p className="muted">This event has finished.</p>
            ) : (
              <div className="stack" style={{ gap: 12 }}>
                <p className="muted" style={{ fontSize: '0.9rem' }}>
                  {event.spotsLeft === 0
                    ? 'Every seat is taken for this one.'
                    : `${event.spotsLeft} seats left. One tap and your QR ticket is ready.`}
                </p>
                <Button
                  variant="primary"
                  block
                  loading={registering}
                  disabled={event.spotsLeft === 0}
                  onClick={onRegister}
                >
                  {event.spotsLeft === 0 ? 'Event full' : 'Register'}
                </Button>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
