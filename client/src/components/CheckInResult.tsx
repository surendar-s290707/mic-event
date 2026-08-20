import type { ScannerFeedback } from '../lib/types';
import { formatTime } from '../lib/format';

/**
 * What the door staff sees after a scan. The API returns one of four verdicts;
 * this maps each to a human sentence. Nothing is ever silently swallowed.
 */
export function CheckInResult({ result }: { result: ScannerFeedback }) {
  if ('queued' in result) {
    return (
      <div className="result result--info" role="status">
        <span className="result__icon" aria-hidden="true">
          ⇅
        </span>
        <div>
          <div className="result__title">Saved offline — we’ll sync when you’re back online</div>
          <div className="result__body">{result.message}</div>
        </div>
      </div>
    );
  }

  if (result.success) {
    const alreadySynced = result.reason === 'ALREADY_SYNCED';
    return (
      <div className="result result--success" role="status">
        <span className="result__icon" aria-hidden="true">
          ✓
        </span>
        <div>
          <div className="result__title">
            {alreadySynced ? 'Already synced' : 'You’re checked in'}
          </div>
          <div className="result__body">
            {result.attendee?.name ?? 'This ticket'}
            {alreadySynced
              ? ` · checked in at ${result.checkedInAt ? formatTime(result.checkedInAt) : 'an earlier time'}`
              : ' · welcome in'}
          </div>
        </div>
      </div>
    );
  }

  const view = {
    ALREADY_CHECKED_IN: {
      className: 'result--warn',
      icon: '!',
      title: 'Already checked in',
      body: `${result.attendee?.name ?? 'This ticket'} was scanned at ${
        result.checkedInAt ? formatTime(result.checkedInAt) : 'an earlier time'
      }${result.reconciled ? ' — your earlier offline scan corrected the time' : ''}`,
    },
    INVALID_TICKET: {
      className: 'result--error',
      icon: '✕',
      title: 'Invalid ticket',
      body: 'We don’t recognise this code. Ask them to open their ticket again.',
    },
    WRONG_EVENT: {
      className: 'result--error',
      icon: '✕',
      title: 'This ticket belongs to another event',
      body: `${result.attendee?.name ?? 'This ticket'} is registered for a different event.`,
    },
  }[result.reason];

  return (
    <div className={`result ${view.className}`} role="status">
      <span className="result__icon" aria-hidden="true">
        {view.icon}
      </span>
      <div>
        <div className="result__title">{view.title}</div>
        <div className="result__body">{view.body}</div>
      </div>
    </div>
  );
}
