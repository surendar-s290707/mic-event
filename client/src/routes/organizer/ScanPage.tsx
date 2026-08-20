import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { ApiError, api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { getStationId } from '../../lib/station';
import {
  forgetScan,
  newClientScanId,
  offlineQueueAvailable,
  pendingScans,
  queueScan,
} from '../../lib/offlineQueue';
import type { ScannerFeedback } from '../../lib/types';
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

  const [result, setResult] = useState<ScannerFeedback | null>(null);
  const [recent, setRecent] = useState<{ result: ScannerFeedback; at: string }[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [manualCode, setManualCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [cameraState, setCameraState] = useState<'idle' | 'starting' | 'running' | 'error'>('idle');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [checkedInCount, setCheckedInCount] = useState<number | null>(null);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScanRef = useRef<{ token: string; at: number } | null>(null);
  const inFlightRef = useRef(false);

  const refreshPending = useCallback(async () => {
    if (!offlineQueueAvailable()) return;
    try {
      setPendingCount((await pendingScans(id)).length);
    } catch {
      /* a browser that refuses IndexedDB just shows no queue */
    }
  }, [id]);

  /**
   * Sends everything the device queued while offline.
   *
   * Every verdict the server returns is final — checked in, already synced,
   * already checked in, invalid, wrong event — so the queue entry is dropped
   * either way. Only a failed *request* leaves a scan queued for the next try,
   * which is what makes this safe to call repeatedly.
   */
  const flushQueue = useCallback(async () => {
    if (syncing || !offlineQueueAvailable()) return;

    const queued = await pendingScans(id).catch(() => []);
    if (queued.length === 0) {
      setPendingCount(0);
      return;
    }

    setSyncing(true);
    try {
      const { results } = await api.syncScans(
        id,
        queued.map(({ clientScanId, token, scannedAt, stationId }) => ({
          clientScanId,
          token,
          scannedAt,
          stationId,
        })),
      );

      for (const outcome of results) await forgetScan(outcome.clientScanId);

      const accepted = results.filter((r) => r.success && r.reason !== 'ALREADY_SYNCED').length;
      const duplicates = results.filter((r) => r.reason === 'ALREADY_CHECKED_IN').length;
      const rejected = results.filter(
        (r) => r.reason === 'INVALID_TICKET' || r.reason === 'WRONG_EVENT',
      ).length;

      setSyncNote(
        `Synced ${results.length} offline scan${results.length === 1 ? '' : 's'}: ` +
          `${accepted} checked in` +
          (duplicates > 0 ? `, ${duplicates} already checked in` : '') +
          (rejected > 0 ? `, ${rejected} rejected` : '') +
          '.',
      );
      if (accepted > 0) setCheckedInCount((count) => (count === null ? null : count + accepted));
    } catch (error) {
      // Still offline, or the server is down: the queue is untouched.
      setSyncNote(
        error instanceof ApiError && error.code === 'network_error'
          ? 'Still offline — your scans are safe on this device.'
          : 'We couldn’t sync just now. Your scans are still queued.',
      );
    } finally {
      setSyncing(false);
      await refreshPending();
    }
  }, [id, refreshPending, syncing]);

  const submitToken = useCallback(
    async (token: string) => {
      if (!token || inFlightRef.current) return;
      inFlightRef.current = true;
      setSubmitting(true);
      setSyncNote(null);

      // Every scan carries its own id, so a queued retry can never be counted
      // twice — the server treats the id as an idempotency key.
      const scan = {
        clientScanId: newClientScanId(),
        eventId: id,
        token,
        scannedAt: new Date().toISOString(),
        stationId: getStationId(),
      };

      const queueLocally = async (message: string) => {
        if (!offlineQueueAvailable()) {
          setCameraError('This browser can’t queue scans offline. Reconnect and scan again.');
          return;
        }
        await queueScan(scan);
        await refreshPending();
        const feedback = { queued: true as const, message };
        setResult(feedback);
        setRecent((prev) => [{ result: feedback, at: new Date().toISOString() }, ...prev].slice(0, 8));
      };

      try {
        // Known to be offline: don't even try, just queue it.
        if (!navigator.onLine) {
          await queueLocally(`${scan.stationId} · queued on this device, nothing lost.`);
          return;
        }

        const outcome = await api.checkIn(id, token, {
          stationId: scan.stationId,
          clientScanId: scan.clientScanId,
          scannedAt: scan.scannedAt,
        });
        setResult(outcome);
        setRecent((prev) => [{ result: outcome, at: new Date().toISOString() }, ...prev].slice(0, 8));
        if (outcome.success && outcome.reason !== 'ALREADY_SYNCED') {
          setCheckedInCount((count) => (count === null ? null : count + 1));
        }
      } catch (error) {
        // The network died mid-scan: queue it rather than losing it.
        if (error instanceof ApiError && error.code === 'network_error') {
          await queueLocally('Connection dropped — queued on this device.');
        } else {
          setResult(null);
          setCameraError(
            error instanceof ApiError ? error.message : 'We couldn’t record that scan.',
          );
        }
      } finally {
        inFlightRef.current = false;
        setSubmitting(false);
      }
    },
    [id, refreshPending],
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

  // Sync as soon as the connection comes back, and once on arrival in case the
  // last session left scans behind.
  useEffect(() => {
    // Arriving (or reloading) with scans still queued: send them now.
    if (navigator.onLine) void flushQueue();
    else void refreshPending();

    const goOnline = () => {
      setOnline(true);
      void flushQueue();
    };
    const goOffline = () => setOnline(false);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
    // flushQueue changes with `syncing`; re-subscribing on that is harmless and
    // keeps the listener pointed at the current queue state.
  }, [refreshPending, flushQueue]);

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

        {!online && (
          <Banner tone="warn">
            You’re offline. Scans are saved on this device and sent automatically when the
            connection returns.
          </Banner>
        )}

        {pendingCount > 0 && (
          <Card padSm>
            <div className="spread">
              <div>
                <strong style={{ fontSize: '0.94rem' }}>
                  {pendingCount} scan{pendingCount === 1 ? '' : 's'} waiting to sync
                </strong>
                <p className="muted" style={{ fontSize: '0.82rem' }}>
                  Kept on this device until the server confirms them.
                </p>
              </div>
              <Button size="sm" loading={syncing} disabled={!online} onClick={() => void flushQueue()}>
                Sync now
              </Button>
            </div>
          </Card>
        )}

        {syncNote && <Banner tone="info">{syncNote}</Banner>}

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
                      {'queued' in entry.result
                        ? 'Queued offline'
                        : (entry.result.attendee?.name ?? 'Unknown ticket')}
                    </div>
                    <div className="list__meta">{timeAgo(entry.at)}</div>
                  </div>
                  <Badge
                    tone={
                      'queued' in entry.result
                        ? 'accent'
                        : entry.result.success
                          ? 'success'
                          : entry.result.reason === 'ALREADY_CHECKED_IN'
                            ? 'warn'
                            : 'danger'
                    }
                  >
                    {'queued' in entry.result
                      ? 'saved offline'
                      : entry.result.success
                        ? 'checked in'
                        : entry.result.reason.replace(/_/g, ' ').toLowerCase()}
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
