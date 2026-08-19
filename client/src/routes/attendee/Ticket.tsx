import { Link, useParams } from 'react-router-dom';
import { useApp } from '../../store/context';
import { formatDay, formatTime } from '../../lib/format';
import { Badge, Button, DevNote, ErrorState } from '../../components/ui';
import { QrPlaceholder } from '../../components/QrPlaceholder';

/**
 * The attendee's ticket. One QR per registration — never one shared code for
 * the whole event.
 *
 * CURRENT MOCK: the code below is a fixed, readable string and the QR is drawn,
 * not encoded.
 * FUTURE: the server issues a signed token that is either short-lived (the page
 * refreshes it while online) or single-use (invalidated the moment it is
 * scanned), which is what stops a screenshot being passed to a friend.
 */
export function Ticket() {
  const { id = '' } = useParams();
  const { user, registrations, getEvent, isCheckedIn } = useApp();

  const registration = registrations.find((r) => r.id === id);
  const event = registration ? getEvent(registration.eventId) : undefined;
  const mine = registration?.attendeeId === user?.id;

  if (!registration || !event || !mine) {
    return (
      <div className="page">
        <ErrorState
          title="We couldn’t find that ticket"
          body="It may belong to another account, or the event was removed."
          action={
            <Link to="/attendee">
              <Button>Back to my events</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const checkedIn = isCheckedIn(registration.id);

  return (
    <div className="page" style={{ maxWidth: 520 }}>
      <div className="pagehead" style={{ marginBottom: 20 }}>
        <div className="pagehead__title">
          <p className="eyebrow">My ticket</p>
          <h1 style={{ fontSize: '1.6rem' }}>{event.name}</h1>
        </div>
      </div>

      <div className="ticket">
        <div className="ticket__head">
          <div className="spread">
            <strong>{user?.name}</strong>
            <Badge tone={checkedIn ? 'success' : 'accent'} dot={checkedIn}>
              {checkedIn ? 'Checked in' : 'Registered'}
            </Badge>
          </div>
          <span className="muted" style={{ fontSize: '0.9rem' }}>
            {formatDay(event.startsAt)}, {formatTime(event.startsAt)} · {event.venue}
          </span>
        </div>

        <div className="ticket__qr">
          <div className="ticket__qrframe">
            <QrPlaceholder value={registration.ticketCode} size={200} />
          </div>
          <strong style={{ fontSize: '1rem' }}>
            {checkedIn ? 'You’re already inside' : 'Show this at the entrance.'}
          </strong>
          <span className="mono muted">{registration.ticketCode}</span>
        </div>

        <div className="ticket__foot">
          <dl className="ticket__rows">
            <div className="ticket__row">
              <dt>Event</dt>
              <dd>{event.name}</dd>
            </div>
            <div className="ticket__row">
              <dt>Doors</dt>
              <dd>
                {formatDay(event.startsAt)}, {formatTime(event.startsAt)}
              </dd>
            </div>
            <div className="ticket__row">
              <dt>Venue</dt>
              <dd>{event.venue}</dd>
            </div>
            <div className="ticket__row">
              <dt>Status</dt>
              <dd>{checkedIn ? 'Checked in' : 'Registered'}</dd>
            </div>
          </dl>

          <Link to={`/attendee/events/${event.id}`}>
            <Button block variant="ghost">
              Event details
            </Button>
          </Link>
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <DevNote>
          Placeholder QR. The real one carries a server-signed token that expires, so a screenshot
          sent to a friend stops working.
        </DevNote>
      </div>
    </div>
  );
}
