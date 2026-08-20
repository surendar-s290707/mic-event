/**
 * A stable id for this device, stored once in localStorage.
 *
 * It is recorded with every check-in so an organizer running two doors can see
 * which one scanned a ticket — and so a future offline queue can tell its own
 * scans apart from another station's.
 */
const KEY = 'mic-event.station-id';

export function getStationId(): string {
  try {
    const existing = localStorage.getItem(KEY);
    if (existing) return existing;
    const id = `station-${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(KEY, id);
    return id;
  } catch {
    // Private mode: a per-session id is still better than nothing.
    return 'station-unknown';
  }
}
