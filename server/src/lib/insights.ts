import Anthropic from '@anthropic-ai/sdk';
import { prisma } from './prisma.js';
import { env } from '../env.js';

/**
 * ===========================================================================
 * AI event insights
 * ===========================================================================
 * The database is the source of truth. This module computes every number
 * itself, in SQL and plain arithmetic, and then hands those finished figures
 * to Claude purely to phrase them. The model is never asked to count, divide
 * or infer anything — if a number is not in the facts below, it cannot appear
 * in the answer.
 *
 * When the AI is unavailable (no key, timeout, API error) the endpoint returns
 * the same computed facts as plain text, so the organizer always gets their
 * numbers.
 */

const PEAK_WINDOW_MINUTES = 15;

export interface EventFacts {
  eventName: string;
  venue: string;
  startsAt: string;
  endsAt: string;
  status: 'upcoming' | 'live' | 'ended';
  capacity: number;
  registeredCount: number;
  checkedInCount: number;
  spotsLeft: number;
  noShowCount: number;
  noShowPercent: number;
  attendancePercent: number;
  firstCheckInAt: string | null;
  lastCheckInAt: string | null;
  peakWindow: { startsAt: string; endsAt: string; count: number } | null;
  busiestWindows: { startsAt: string; count: number }[];
}

/** Every figure the AI is allowed to talk about, computed here. */
export async function computeEventFacts(eventId: string): Promise<EventFacts> {
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });

  const [registeredCount, checkIns] = await Promise.all([
    prisma.registration.count({ where: { eventId } }),
    prisma.checkIn.findMany({
      where: { registration: { eventId } },
      select: { checkedInAt: true },
      orderBy: { checkedInAt: 'asc' },
    }),
  ]);

  const checkedInCount = checkIns.length;
  const noShowCount = Math.max(0, registeredCount - checkedInCount);

  // Busiest fixed-size window: bucket the check-ins and take the fullest.
  const buckets = new Map<number, number>();
  const bucketMs = PEAK_WINDOW_MINUTES * 60_000;
  for (const checkIn of checkIns) {
    const key = Math.floor(checkIn.checkedInAt.getTime() / bucketMs) * bucketMs;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  const ranked = [...buckets.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const [peakStart, peakCount] = ranked[0] ?? [];

  const now = Date.now();
  const status =
    now < event.startsAt.getTime() ? 'upcoming' : now <= event.endsAt.getTime() ? 'live' : 'ended';

  return {
    eventName: event.name,
    venue: event.venue,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
    status,
    capacity: event.capacity,
    registeredCount,
    checkedInCount,
    spotsLeft: Math.max(0, event.capacity - registeredCount),
    noShowCount,
    noShowPercent: registeredCount === 0 ? 0 : Math.round((noShowCount / registeredCount) * 100),
    attendancePercent:
      registeredCount === 0 ? 0 : Math.round((checkedInCount / registeredCount) * 100),
    firstCheckInAt: checkIns[0]?.checkedInAt.toISOString() ?? null,
    lastCheckInAt: checkIns[checkIns.length - 1]?.checkedInAt.toISOString() ?? null,
    peakWindow:
      peakStart === undefined
        ? null
        : {
            startsAt: new Date(peakStart).toISOString(),
            endsAt: new Date(peakStart + bucketMs).toISOString(),
            count: peakCount ?? 0,
          },
    busiestWindows: ranked.slice(0, 3).map(([start, count]) => ({
      startsAt: new Date(start).toISOString(),
      count,
    })),
  };
}

/** The answer shown when the AI cannot be reached: the raw computed numbers. */
export function factsAsPlainText(facts: EventFacts): string {
  const time = (iso: string | null) =>
    iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '—';

  const lines = [
    `${facts.checkedInCount} of ${facts.registeredCount} registered attendees have checked in (${facts.attendancePercent}%).`,
    `${facts.noShowCount} ${facts.noShowCount === 1 ? 'has' : 'have'} not turned up yet — that is ${facts.noShowPercent}% no-shows.`,
    `${facts.spotsLeft} of ${facts.capacity} seats are still open for registration.`,
  ];
  if (facts.peakWindow) {
    lines.push(
      `Check-ins peaked around ${time(facts.peakWindow.startsAt)} with ${facts.peakWindow.count} in ${PEAK_WINDOW_MINUTES} minutes.`,
    );
  } else {
    lines.push('Nobody has checked in yet, so there is no peak time.');
  }
  return lines.join(' ');
}

const SYSTEM_PROMPT = `You answer questions about a campus event for its organizer.

You are given a JSON object of verified facts that were computed from the event
database. Those numbers are the only numbers that exist.

Rules:
- Use only the figures in the facts. Never calculate, estimate, extrapolate or
  invent a number, including totals, percentages, rates or times.
- If the facts do not contain what was asked, say so plainly and offer the
  closest fact that is present.
- Times in the facts are ISO timestamps. Say them as clock times.
- Answer in at most three short sentences, in plain language, as if talking to
  a student running the door. No preamble, no bullet lists.`;

export interface InsightAnswer {
  answer: string;
  facts: EventFacts;
  /** 'ai' when Claude phrased it, 'fallback' when the raw numbers are shown. */
  source: 'ai' | 'fallback';
  /** Why the fallback was used, when it was. */
  fallbackReason?: 'not_configured' | 'timeout' | 'api_error';
}

/**
 * Asks Claude to phrase the computed facts. The API key stays on the server —
 * this module is never imported by the client.
 */
export async function answerEventQuestion(
  eventId: string,
  question: string,
): Promise<InsightAnswer> {
  const facts = await computeEventFacts(eventId);

  if (!env.anthropicApiKey) {
    return { answer: factsAsPlainText(facts), facts, source: 'fallback', fallbackReason: 'not_configured' };
  }

  const client = new Anthropic({
    apiKey: env.anthropicApiKey,
    baseURL: env.anthropicBaseUrl,
    timeout: env.aiTimeoutMs, // milliseconds
    // One retry only: an organizer at the door would rather have the raw
    // numbers now than a polished sentence in twenty seconds.
    maxRetries: 1,
  });

  try {
    const response = await client.messages.create({
      model: 'claude-opus-5',
      max_tokens: 1024,
      // A phrasing job, not a reasoning one — keep it fast and cheap.
      output_config: { effort: 'low' },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Question: ${question}\n\nVerified facts (JSON):\n${JSON.stringify(facts, null, 2)}`,
        },
      ],
    });

    const answer = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();

    if (!answer) {
      return { answer: factsAsPlainText(facts), facts, source: 'fallback', fallbackReason: 'api_error' };
    }
    return { answer, facts, source: 'ai' };
  } catch (error) {
    const timedOut =
      error instanceof Anthropic.APIConnectionTimeoutError ||
      (error instanceof Error && error.name === 'AbortError');
    console.error('[insights] AI call failed, falling back to raw stats:', error);
    return {
      answer: factsAsPlainText(facts),
      facts,
      source: 'fallback',
      fallbackReason: timedOut ? 'timeout' : 'api_error',
    };
  }
}
