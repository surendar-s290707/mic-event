import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApp } from '../../store/context';
import type { CheckInResultData } from '../../lib/types';
import { formatTime, timeAgo } from '../../lib/format';
import { Badge, Button, Card, DevNote, ErrorState, Input } from '../../components/ui';
import { CheckInResult } from '../../components/CheckInResult';

/**
 * ===========================================================================
 * CURRENT MOCK FUNCTIONALITY — the camera is a drawing.
 * ===========================================================================
 * Scans are triggered by the buttons below or by typing a ticket code, and
 * they resolve against in-memory data.
 *
 * FUTURE REAL IMPLEMENTATION
 * `html5-qrcode` mounts into the <div id="qr-viewport"> element below and
 * calls the same handleScan() with the decoded string, so nothing else on
 * this screen changes. handleScan then POSTs to /api/check-ins, where a
 * unique constraint — not this component — is what actually prevents a
 * duplicate check-in. The offline toggle becomes a real navigator.onLine
 * listener with an IndexedDB queue.
 */
export function ScanPage() {
  const { id = '' } = useParams();
  const { getEvent, getStats, checkInByTicketCode, sampleTicketCodes } = useApp();

  const [result, setResult] = useState<CheckInResultData | null>(null);
  const [recent, setRecent] = useState<{ result: CheckInResultData; at: string }[]>([]);
  const [manualCode, setManualCode] = useState('');
  const [offline, setOffline] = useState(false);
  const [scanning, setScanning] = useState(false);

  const event = getEvent(id);
  if (!event) {
    return (
      <div className="page">
        <ErrorState
          title="We couldn’t find that event"
          body="Open the event from your dashboard and try again."
          action={
            <Link to="/organizer/events">
              <Button>Back to events</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const stats = getStats(event.id);
  const samples = sampleTicketCodes(event.id);

  function handleScan(code: string) {
    if (!code) return;
    setScanning(true);
    // Small delay so the success/duplicate states are visible, like a real scan.
    setTimeout(() => {
      const outcome = checkInByTicketCode(code, event!.id, { offline });
      setResult(outcome);
      setRecent((prev) => [{ result: outcome, at: new Date().toISOString() }, ...prev].slice(0, 6));
      setScanning(false);
    }, 350);
  }

  function onManualSubmit(e: FormEvent) {
    e.preventDefault();
    handleScan(manualCode.trim());
    setManualCode('');
  }

  return (
    <div className="page">
      <div className="scanner">
        <div className="spread">
          <div>
            <p className="eyebrow">Scanning for</p>
            <h2 style={{ fontSize: '1.25rem', marginTop: 2 }}>{event.name}</h2>
            <p className="muted" style={{ fontSize: '0.88rem' }}>
              {event.venue} · {formatTime(event.startsAt)}
            </p>
          </div>
          <Badge tone="accent">
            {stats.checkedIn} / {stats.registered} in
          </Badge>
        </div>

        {/* html5-qrcode will render its video stream into this element. */}
        <div className="scanner__viewport" id="qr-viewport">
          <div className="scanner__frame">
            <span className="scanner__corner" />
          </div>
          <p className="scanner__hint">
            {offline ? 'Offline — scans are saved on this device' : 'Point your camera at the attendee QR'}
          </p>
          <span className="scanner__placeholder">Camera placeholder</span>
        </div>

        <div className="row" style={{ gap: 10, flexWrap: 'nowrap' }}>
          <Button
            variant="primary"
            loading={scanning}
            style={{ flex: 1 }}
            onClick={() => handleScan(samples.fresh ?? '')}
          >
            Simulate scan
          </Button>
          <Button
            variant={offline ? 'danger' : 'default'}
            onClick={() => setOffline((prev) => !prev)}
            aria-pressed={offline}
          >
            {offline ? 'Offline mode on' : 'Go offline'}
          </Button>
        </div>

        {result && <CheckInResult result={result} />}

        <Card padSm>
          <form className="row" style={{ gap: 8, flexWrap: 'nowrap' }} onSubmit={onManualSubmit}>
            <Input
              aria-label="Ticket code"
              placeholder="Type a ticket code"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
            />
            <Button type="submit" disabled={!manualCode.trim()}>
              Check in
            </Button>
          </form>
          <p className="muted" style={{ fontSize: '0.82rem', marginTop: 10 }}>
            Manual entry is the fallback when a phone screen is too cracked to scan.
          </p>
        </Card>

        <Card padSm>
          <h3 style={{ fontSize: '0.92rem', marginBottom: 10 }}>Try the edge cases</h3>
          <div className="row" style={{ gap: 8 }}>
            <Button size="sm" onClick={() => handleScan(samples.used ?? '')} disabled={!samples.used}>
              Already checked in
            </Button>
            <Button size="sm" onClick={() => handleScan('MIC-XXX-000000')}>
              Invalid ticket
            </Button>
            <Button size="sm" onClick={() => handleScan(samples.otherEvent ?? '')} disabled={!samples.otherEvent}>
              Wrong event
            </Button>
          </div>
        </Card>

        {recent.length > 0 && (
          <Card padSm>
            <h3 style={{ fontSize: '0.92rem', marginBottom: 6 }}>This session</h3>
            <div className="list">
              {recent.map((entry, index) => (
                <div className="list__row" key={`${entry.at}-${index}`}>
                  <div className="list__main">
                    <div className="list__name">{entry.result.attendeeName ?? 'Unknown ticket'}</div>
                    <div className="list__meta">{timeAgo(entry.at)}</div>
                  </div>
                  <Badge
                    tone={
                      entry.result.outcome === 'success'
                        ? 'success'
                        : entry.result.outcome === 'already_checked_in'
                          ? 'warn'
                          : entry.result.outcome === 'offline_saved'
                            ? 'accent'
                            : 'danger'
                    }
                  >
                    {entry.result.outcome.replace(/_/g, ' ')}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        )}

        <DevNote>
          No camera yet and no server call — the real scanner and the database check-in (with the
          unique constraint that actually stops duplicates) plug into this same screen.
        </DevNote>

        <Link to={`/organizer/events/${event.id}/dashboard`}>
          <Button variant="ghost" block>
            Open live dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}
