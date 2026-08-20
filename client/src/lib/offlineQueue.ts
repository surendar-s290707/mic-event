/**
 * A scan queue that survives losing the network — and losing the tab.
 *
 * IndexedDB rather than memory or localStorage: the door staff may reload the
 * page, the phone may sleep, and a queued check-in must not evaporate.
 * Written against the raw API — one object store and four operations do not
 * justify a wrapper library.
 */

export interface QueuedScan {
  /** Generated on this device before the scan is sent; the server's idempotency key. */
  clientScanId: string;
  eventId: string;
  token: string;
  /** When the scan actually happened, not when it was sent. */
  scannedAt: string;
  stationId: string;
}

const DB_NAME = 'mic-event';
const DB_VERSION = 1;
const STORE = 'pending-scans';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'clientScanId' });
        store.createIndex('eventId', 'eventId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = work(transaction.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => db.close();
      }),
  );
}

/** Unique per scan. crypto.randomUUID is available in every browser we target. */
export function newClientScanId(): string {
  return `scan-${crypto.randomUUID()}`;
}

export function queueScan(scan: QueuedScan): Promise<unknown> {
  return run('readwrite', (store) => store.put(scan));
}

export async function pendingScans(eventId: string): Promise<QueuedScan[]> {
  const all = await run<QueuedScan[]>('readonly', (store) => store.getAll() as IDBRequest<QueuedScan[]>);
  return all.filter((scan) => scan.eventId === eventId);
}

export function forgetScan(clientScanId: string): Promise<unknown> {
  return run('readwrite', (store) => store.delete(clientScanId));
}

/** True when this browser can queue at all (private modes sometimes cannot). */
export function offlineQueueAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}
