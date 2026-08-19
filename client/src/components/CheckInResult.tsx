import type { CheckInResultData } from '../lib/types';
import { formatTime } from '../lib/format';

/**
 * The five states the door staff can see after a scan (spec section 12).
 * Kept in one component so the scanner, the offline queue and — later — the
 * real API response all render check-in feedback identically.
 */

const tone: Record<CheckInResultData['outcome'], { className: string; icon: string; title: string }> = {
  success: { className: 'result--success', icon: '✓', title: "You're checked in" },
  already_checked_in: { className: 'result--warn', icon: '!', title: 'Already checked in' },
  invalid_ticket: { className: 'result--error', icon: '✕', title: 'Invalid ticket' },
  wrong_event: { className: 'result--error', icon: '✕', title: 'This ticket belongs to another event' },
  offline_saved: { className: 'result--info', icon: '⇅', title: "Saved offline — we'll sync when you're back online" },
};

export function CheckInResult({ result }: { result: CheckInResultData }) {
  const { className, icon, title } = tone[result.outcome];

  return (
    <div className={`result ${className}`} role="status">
      <span className="result__icon" aria-hidden="true">
        {icon}
      </span>
      <div>
        <div className="result__title">{title}</div>
        <div className="result__body">
          {result.outcome === 'success' && `${result.attendeeName} · welcome in`}
          {result.outcome === 'already_checked_in' &&
            `${result.attendeeName} was scanned at ${result.checkedInAt ? formatTime(result.checkedInAt) : 'an earlier time'}`}
          {result.outcome === 'invalid_ticket' && 'We don’t recognise this code. Ask them to open their ticket again.'}
          {result.outcome === 'wrong_event' &&
            `${result.attendeeName ?? 'This ticket'} is registered for a different event.`}
          {result.outcome === 'offline_saved' &&
            `${result.attendeeName} · queued on this device, nothing lost.`}
        </div>
        {result.ticketCode && (
          <div className="mono muted" style={{ marginTop: 6 }}>
            {result.ticketCode}
          </div>
        )}
      </div>
    </div>
  );
}
