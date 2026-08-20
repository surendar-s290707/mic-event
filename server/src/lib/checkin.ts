import { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';

/**
 * One implementation of "record this scan", used by the live scanner endpoint
 * and by the offline sync endpoint. Having a single function is the whole
 * point: an offline scan replayed later must be judged by exactly the same
 * rules as one that happened online.
 *
 * ---------------------------------------------------------------------------
 * CONFLICT POLICY
 * ---------------------------------------------------------------------------
 * A registration can hold at most one CheckIn row (unique constraint). So:
 *
 *  1. Replaying the same clientScanId never writes twice. The unique index on
 *     clientScanId means the retry either finds its own earlier row (and gets
 *     the original answer back) or loses the insert race and is reported as a
 *     duplicate. Sync is therefore safe to run as many times as it likes.
 *
 *  2. Scanned offline at station A, then online at station B before A
 *     reconnects: B's scan creates the row. When A syncs, no second row is
 *     created — A is told ALREADY_CHECKED_IN. If A's scan actually happened
 *     *earlier* than B's, checkedInAt is corrected backwards to A's time,
 *     because that is when the attendee really walked in, and the arrivals
 *     chart and "when did check-ins peak" should reflect the door, not the
 *     network. The scan is never silently dropped: the syncing station sees
 *     the duplicate verdict and the reconciliation.
 *
 * Why not let the earlier scan win the row outright? Deleting and re-inserting
 * would churn ids for no gain — the attendee is inside either way, and one row
 * per registration is what makes duplicate protection provable.
 */

export type CheckInOutcome =
  | 'CHECKED_IN'
  | 'ALREADY_CHECKED_IN'
  | 'ALREADY_SYNCED'
  | 'INVALID_TICKET'
  | 'WRONG_EVENT';

export interface CheckInResult {
  success: boolean;
  reason?: Exclude<CheckInOutcome, 'CHECKED_IN'>;
  message: string;
  attendee?: { name: string };
  checkedInAt?: string | null;
  /** True when a queued scan turned out to be earlier than the stored time. */
  reconciled?: boolean;
}

export interface CheckInInput {
  eventId: string;
  token: string;
  /** Device-generated id. Present for offline scans; optional when online. */
  clientScanId?: string;
  /** When the scan happened on the device. Ignored if implausible. */
  scannedAt?: string;
  stationId?: string;
}

/** A client clock can be wrong or hostile; only accept a sane recent time. */
function safeScanTime(scannedAt: string | undefined): Date | undefined {
  if (!scannedAt) return undefined;
  const time = new Date(scannedAt);
  if (Number.isNaN(time.getTime())) return undefined;
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  if (time.getTime() > now + 60_000) return undefined; // future
  if (time.getTime() < now - oneDay) return undefined; // stale beyond a day
  return time;
}

export async function recordCheckIn(input: CheckInInput): Promise<CheckInResult> {
  const scannedAt = safeScanTime(input.scannedAt);

  // Idempotent replay: this exact scan has already been recorded.
  if (input.clientScanId) {
    const previous = await prisma.checkIn.findUnique({
      where: { clientScanId: input.clientScanId },
      include: { registration: { include: { user: true } } },
    });
    if (previous) {
      return {
        success: true,
        reason: 'ALREADY_SYNCED',
        message: 'This scan was already synced.',
        attendee: { name: previous.registration.user.name },
        checkedInAt: previous.checkedInAt.toISOString(),
      };
    }
  }

  const registration = await prisma.registration.findUnique({
    where: { qrToken: input.token },
    include: { user: true },
  });

  if (!registration) {
    return { success: false, reason: 'INVALID_TICKET', message: 'We don’t recognise this ticket.' };
  }

  if (registration.eventId !== input.eventId) {
    return {
      success: false,
      reason: 'WRONG_EVENT',
      message: 'This ticket belongs to another event.',
      attendee: { name: registration.user.name },
    };
  }

  try {
    const checkIn = await prisma.checkIn.create({
      data: {
        registrationId: registration.id,
        stationId: input.stationId ?? null,
        clientScanId: input.clientScanId ?? null,
        ...(scannedAt ? { checkedInAt: scannedAt } : {}),
      },
    });
    return {
      success: true,
      message: 'Checked in successfully',
      attendee: { name: registration.user.name },
      checkedInAt: checkIn.checkedInAt.toISOString(),
    };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
      throw error;
    }

    // Lost a race on clientScanId: our own retry already landed.
    const target = (error.meta?.target as string[] | string | undefined) ?? '';
    if (String(target).includes('clientScanId') && input.clientScanId) {
      const own = await prisma.checkIn.findUnique({
        where: { clientScanId: input.clientScanId },
      });
      return {
        success: true,
        reason: 'ALREADY_SYNCED',
        message: 'This scan was already synced.',
        attendee: { name: registration.user.name },
        checkedInAt: own?.checkedInAt.toISOString() ?? null,
      };
    }

    // Someone (or another station) checked this registration in first.
    let existing = await prisma.checkIn.findUnique({
      where: { registrationId: registration.id },
    });

    // Earliest scan wins the timestamp — see CONFLICT POLICY above.
    let reconciled = false;
    if (existing && scannedAt && scannedAt < existing.checkedInAt) {
      existing = await prisma.checkIn.update({
        where: { id: existing.id },
        data: { checkedInAt: scannedAt },
      });
      reconciled = true;
    }

    return {
      success: false,
      reason: 'ALREADY_CHECKED_IN',
      message: reconciled
        ? 'Already checked in — this earlier scan corrected the time.'
        : 'This ticket was already used.',
      attendee: { name: registration.user.name },
      checkedInAt: existing?.checkedInAt.toISOString() ?? null,
      ...(reconciled ? { reconciled: true } : {}),
    };
  }
}
