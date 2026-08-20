import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { formatDay, formatTime } from '../../lib/format';
import { Badge, Button, ErrorState, LoadingState } from '../../components/ui';
import { Qr } from '../../components/Qr';

/**
 * The attendee's ticket: one QR per registration, never one code for the whole
 * event. The QR holds only the opaque token the server issued — the API
 * returns it to the owner of the registration and to nobody else.
 */
export function Ticket() {
  const { id = '' } = useParams();
  const request = useAsync(() => api.getTicket(id).then((r) => r.ticket), [id]);

  if (request.loading) {
    return (
      <div className="page">
        <LoadingState label="Loading your ticket…" />
      </div>
    );
  }

  if (request.error || !request.data) {
    return (
      <div className="page">
        <ErrorState
          title="We couldn’t find that ticket"
          body={request.error?.message ?? 'It may belong to another account, or the event was removed.'}
          action={
            <Link to="/attendee">
              <Button>Back to my events</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const ticket = request.data;
  const { event } = ticket;

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
            <strong>{ticket.attendee.name}</strong>
            <Badge tone={ticket.checkedIn ? 'success' : 'accent'} dot={ticket.checkedIn}>
              {ticket.checkedIn ? 'Checked in' : 'Registered'}
            </Badge>
          </div>
          <span className="muted" style={{ fontSize: '0.9rem' }}>
            {formatDay(event.startsAt)}, {formatTime(event.startsAt)} · {event.venue}
          </span>
        </div>

        <div className="ticket__qr">
          <div className="ticket__qrframe">
            <Qr value={ticket.qrToken} size={200} />
          </div>
          <strong style={{ fontSize: '1rem' }}>
            {ticket.checkedIn ? 'You’re already inside' : 'Show this at the entrance.'}
          </strong>
          <span className="muted" style={{ fontSize: '0.8rem' }}>
            {ticket.checkedIn
              ? `Scanned at ${formatTime(ticket.checkedInAt!)}`
              : 'One scan, one entry.'}
          </span>
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
              <dd>{ticket.checkedIn ? 'Checked in' : 'Registered'}</dd>
            </div>
          </dl>

          <Link to={`/attendee/events/${event.id}`}>
            <Button block variant="ghost">
              Event details
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
