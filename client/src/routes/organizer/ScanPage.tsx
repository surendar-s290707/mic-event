import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { ApiError, api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { getStationId } from '../../lib/station';
import type { ScanResult } from '../../lib/types';
import { formatTime, timeAgo } from '../../lib/format';
import { Badge, Banner, Button, Card, ErrorState, Input, LoadingState } from '../../components/ui';
import { CheckInResult } from '../../components/CheckInResult';

/** Element the camera stream is mounted into. */
const VIEWPORT_ID = 'qr-viewport';

/**
 * A camera pointed at a QR fires the decode callback many times a second while
 * the code stays in frame. Without this window the same ticket would be POSTed
 * dozens of times and every scan after the first would come back as a
 * duplicate. The check-in endpoint is safe either way — this is about not
 * shouting "already checked in" at someone who just walked in.
 */
const SAME_CODE_COOLDOWN_MS = 4000;

export function ScanPage() {
  const { id = '' } = useParams();
  const eventRequest = useAsync(() => api.getEvent(id).then((r) => r.event), [id]);

  const [result, setResult] = useState<ScanResult | null>(null);
  const [recent, setRecent] = useState<{ result: ScanResult; at: string }[]>([]);
  const [manualCode, setManualCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [cameraState, setCameraState] = useState<'idle' | 'starting' | 'running' | 'error'>('idle');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [checkedInCount, setCheckedInCount] = useState<number | null>(null);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScanRef = useRef<{ token: string; at: number } | null>(null);
  const inFlightRef = useRef(false);

  const submitToken = useCallback(
    async (token: string) => {
      if (!token || inFlightRef.current) return;
      inFlightRef.current = true;
      setSubmitting(true);
      try {
        const scan = await api.checkIn(id, token, getStationId());
        setResult(scan);
        setRecent((prev) => [{ result: scan, at: new Date().toISOString() }, ...prev].slice(0, 8));
        if (scan.success) setCheckedInCount((count) => (count === null ? null : count + 1));
      } catch (error) {
        // A failed request is not a scan verdict — say so plainly.
        setResult(null);
        setCameraError(
          error instanceof ApiError
            ? error.message
            : 'We couldn’t reach the server to record that scan.',
        );
      } finally {
        inFlightRef.current = false;
        setSubmitting(false);
      }
    },
    [id],
  );

  const onDecoded = useCallback(
    (decoded: string) => {
      const token = decoded.trim();
      const last = lastScanRef.current;
      if (last && last.token === token && Date.now() - last.at < SAME_CODE_COOLDOWN_MS) return;
      lastScanRef.current = { token, at: Date.now() };
      void submitToken(token);
    },
    [submitToken],
  );

  const startCamera = useCallback(async () => {
    setCameraState('starting');
    setCameraError(null);
    try {
      const scanner = new Html5Qrcode(VIEWPORT_ID, { verbose: false });
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' }, // rear camera on a phone
        { fps: 10, qrbox: { width: 240, height: 240 } },
        onDecoded,
        undefined, // per-frame decode failures are normal; ignore them
      );
      setCameraState('running');
    } catch (error) {
      scannerRef.current = null;
      setCameraState('error');
      setCameraError(
        error instanceof Error && /permission|denied|NotAllowed/i.test(error.message)
          ? 'Camera access was blocked. Allow it in your browser, or type the ticket code below.'
          : 'We couldn’t start the camera on this device. You can still type the ticket code below.',
      );
    }
  }, [onDecoded]);

  // Always release the camera when leaving the screen.
  useEffect(() => {
    return () => {
      const scanner = scannerRef.current;
      if (!scanner) return;
      scanner
        .stop()
        .then(() => scanner.clear())
        .catch(() => {
          /* already stopped */
        });
      scannerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (eventRequest.data && checkedInCount === null) {
      setCheckedInCount(eventRequest.data.checkedInCount ?? 0);
    }
  }, [eventRequest.data, checkedInCount]);

  function onManualSubmit(e: FormEvent) {
    e.preventDefault();
    const code = manualCode.trim();
    setManualCode('');
    lastScanRef.current = null; // typed codes are always deliberate
    void submitToken(code);
  }

  if (eventRequest.loading) {
    return (
      <div className="page">
        <LoadingState label="Loading event…" />
      </div>
    );
  }

  if (eventRequest.error || !eventRequest.data) {
    return (
      <div className="page">
        <ErrorState
          title={eventRequest.error?.status === 403 ? 'That event isn’t yours' : 'We couldn’t find that event'}
          body={eventRequest.error?.message ?? 'Open the event from your dashboard and try again.'}
          action={
            <Link to="/organizer/events">
              <Button>Back to events</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const event = eventRequest.data;

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
            {checkedInCount ?? event.checkedInCount ?? 0} / {event.registeredCount} in
          </Badge>
        </div>

        <div className="scanner__viewport">
          {/*
            html5-qrcode empties and rewrites this element, so it gets a node of
            its own that React never renders into — otherwise React and the
            library fight over the same children and the placeholder disappears
            for good after a failed camera start.
          */}
          <div id={VIEWPORT_ID} className="scanner__camera" />

          {cameraState !== 'running' && (
            <>
              <div className="scanner__frame">
                <span className="scanner__corner" />
              </div>
              <p className="scanner__hint">
                {cameraState === 'starting'
                  ? 'Starting the camera…'
                  : cameraState === 'error'
                    ? 'Camera unavailable — type the code below'
                    : 'Point your camera at the attendee QR'}
              </p>
            </>
          )}
        </div>

        {cameraState === 'running' ? (
          <Button
            variant="ghost"
            block
            onClick={async () => {
              const scanner = scannerRef.current;
              if (scanner) {
                await scanner.stop().catch(() => {});
                scanner.clear();
                scannerRef.current = null;
              }
              setCameraState('idle');
            }}
          >
            Stop camera
          </Button>
        ) : (
          <Button variant="primary" block loading={cameraState === 'starting'} onClick={startCamera}>
            {cameraState === 'error' ? 'Try the camera again' : 'Start camera'}
          </Button>
        )}

        {cameraError && <Banner tone="warn">{cameraError}</Banner>}

        {submitting && !result && <LoadingState label="Checking that ticket…" />}
        {result && <CheckInResult result={result} />}

        <Card padSm>
          <form className="row" style={{ gap: 8, flexWrap: 'nowrap' }} onSubmit={onManualSubmit}>
            <Input
              aria-label="Ticket code"
              placeholder="Or type a ticket code"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
            />
            <Button type="submit" disabled={!manualCode.trim() || submitting}>
              Check in
            </Button>
          </form>
          <p className="muted" style={{ fontSize: '0.82rem', marginTop: 10 }}>
            Manual entry is the fallback when a phone screen is too cracked to scan.
          </p>
        </Card>

        {recent.length > 0 && (
          <Card padSm>
            <h3 style={{ fontSize: '0.92rem', marginBottom: 6 }}>This session</h3>
            <div className="list">
              {recent.map((entry, index) => (
                <div className="list__row" key={`${entry.at}-${index}`}>
                  <div className="list__main">
                    <div className="list__name">
                      {entry.result.success
                        ? entry.result.attendee.name
                        : (entry.result.attendee?.name ?? 'Unknown ticket')}
                    </div>
                    <div className="list__meta">{timeAgo(entry.at)}</div>
                  </div>
                  <Badge
                    tone={
                      entry.result.success
                        ? 'success'
                        : entry.result.reason === 'ALREADY_CHECKED_IN'
                          ? 'warn'
                          : 'danger'
                    }
                  >
                    {entry.result.success ? 'checked in' : entry.result.reason.replace(/_/g, ' ').toLowerCase()}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        )}

        <Link to={`/organizer/events/${event.id}/dashboard`}>
          <Button variant="ghost" block>
            Open live dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}
