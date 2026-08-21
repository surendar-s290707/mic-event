import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../env.js';
import { prisma } from './prisma.js';

/**
 * ===========================================================================
 * Rotating ticket tokens — the answer to screenshot sharing
 * ===========================================================================
 * A QR code is an image; anyone can photograph it and send it to a friend. So
 * the QR does not contain anything permanent.
 *
 * What the attendee's screen shows is a token that is only valid for one
 * minute:
 *
 *     MIC1.<registrationId>.<expiryUnixSeconds>.<hmac>
 *
 * The HMAC is over those three parts plus the registration's permanent
 * `qrToken`, keyed with JWT_SECRET. The permanent token never leaves the
 * server — it is not in any API response — so there is nothing durable for an
 * attendee to copy out of their own network tab, and a screenshot taken at
 * 6:30 is refused at 6:35.
 *
 * The ticket page refreshes the token while it is open, which is the tradeoff:
 * the attendee's phone has to be online at the door. That is a much softer
 * requirement than the scanner being online (the scanner queues offline), and
 * an attendee whose phone is dead can still be checked in by the organizer
 * typing the code the ticket shows.
 *
 * Expiry is checked against *when the scanner saw the code*, not when the
 * server processes it, so a scan queued offline for twenty minutes still
 * validates. The scanner is an authenticated organizer, so its clock is a
 * trusted-enough witness — and `scannedAt` is already clamped to a sane range
 * before it reaches here.
 */

const PREFIX = 'MIC1';

function sign(registrationId: string, expiry: number, secret: string): string {
  return createHmac('sha256', env.jwtSecret)
    .update(`${PREFIX}.${registrationId}.${expiry}.${secret}`)
    .digest('base64url');
}

export interface IssuedTicketToken {
  payload: string;
  expiresAt: string;
  ttlSeconds: number;
}

/** Builds the value the attendee's QR (and readable code) contains right now. */
export function issueTicketToken(registrationId: string, permanentToken: string): IssuedTicketToken {
  const ttl = env.ticketTtlSeconds;
  const expiry = Math.floor(Date.now() / 1000) + ttl;
  return {
    payload: `${PREFIX}.${registrationId}.${expiry}.${sign(registrationId, expiry, permanentToken)}`,
    expiresAt: new Date(expiry * 1000).toISOString(),
    ttlSeconds: ttl,
  };
}

export type TicketTokenFailure = 'malformed' | 'expired' | 'bad_signature' | 'unknown_registration';

export type TicketTokenResult =
  | { ok: true; registrationId: string }
  | { ok: false; failure: TicketTokenFailure };

/**
 * Verifies a scanned token.
 * @param seenAt when the scanner read it — expiry is judged against this.
 */
export async function resolveTicketToken(raw: string, seenAt: Date): Promise<TicketTokenResult> {
  const parts = raw.trim().split('.');
  if (parts.length !== 4 || parts[0] !== PREFIX) return { ok: false, failure: 'malformed' };

  const [, registrationId, expiryText, signature] = parts;
  const expiry = Number(expiryText);
  if (!Number.isFinite(expiry)) return { ok: false, failure: 'malformed' };

  const registration = await prisma.registration.findUnique({
    where: { id: registrationId },
    select: { qrToken: true },
  });
  if (!registration) return { ok: false, failure: 'unknown_registration' };

  // Authenticate before trusting anything the token claims. The expiry is part
  // of the signed payload, so checking it first would mean acting on
  // unverified input — and would tell someone waving a forged code to "get a
  // fresh one", which is both wrong and unhelpful.
  const expected = sign(registrationId, expiry, registration.qrToken);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  // Constant-time compare, length-checked first since timingSafeEqual throws
  // on a length mismatch.
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, failure: 'bad_signature' };

  // Only now is the expiry a fact rather than a claim.
  if (Math.floor(seenAt.getTime() / 1000) > expiry) return { ok: false, failure: 'expired' };

  return { ok: true, registrationId };
}
