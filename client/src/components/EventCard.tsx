import { Link } from 'react-router-dom';
import type { EventItem, EventStats } from '../lib/types';
import { eventStatus, formatDay, formatTime, statusLabel } from '../lib/format';
import { Badge } from './ui';
import type { ReactNode } from 'react';

const statusTone = {
  upcoming: 'outline',
  live: 'success',
  ended: 'neutral',
} as const;

/** One event, one card — used by both the organizer and attendee lists. */
export function EventCard({
  event,
  stats,
  to,
  footer,
  rightSlot,
}: {
  event: EventItem;
  stats: EventStats;
  to: string;
  footer?: ReactNode;
  rightSlot?: ReactNode;
}) {
  const status = eventStatus(event);

  return (
    <div className="card eventcard">
      <div className="eventcard__top">
        <Link to={to} className="eventcard__name">
          {event.name}
        </Link>
        {rightSlot ?? (
          <Badge tone={statusTone[status]} dot={status === 'live'}>
            {statusLabel[status]}
          </Badge>
        )}
      </div>

      <div className="eventcard__meta">
        <span>
          {formatDay(event.startsAt)} · {formatTime(event.startsAt)}
        </span>
        <span>{event.venue}</span>
      </div>

      <div className="eventcard__foot">
        <span className="muted" style={{ fontSize: '0.86rem' }}>
          {stats.registered} / {stats.capacity} registered
        </span>
        {footer}
      </div>
    </div>
  );
}
