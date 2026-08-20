import type { EventStatus } from './types';

const dayFmt = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
const timeFmt = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** "Today", "Tomorrow", "Yesterday" or "Fri, 22 Aug". */
export function formatDay(value: string | Date): string {
  const date = new Date(value);
  const diffDays = Math.round((startOfDay(date) - startOfDay(new Date())) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  return dayFmt.format(date);
}

/** "6:30 pm" */
export function formatTime(value: string | Date): string {
  return timeFmt.format(new Date(value)).toLowerCase();
}

/** "Today · 6:30 pm" */
export function formatDayTime(value: string | Date): string {
  return `${formatDay(value)} · ${formatTime(value)}`;
}

/** "just now", "12 min ago", "2 h ago", else the day. */
export function timeAgo(value: string | Date): string {
  const ms = Date.now() - new Date(value).getTime();
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return formatDay(value);
}

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function greeting(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Status is always derived from the event's own times, never stored. */
export function eventStatus(event: { startsAt: string; endsAt: string }): EventStatus {
  const now = Date.now();
  if (now < new Date(event.startsAt).getTime()) return 'upcoming';
  if (now <= new Date(event.endsAt).getTime()) return 'live';
  return 'ended';
}

export const statusLabel: Record<EventStatus, string> = {
  upcoming: 'Upcoming',
  live: 'Happening now',
  ended: 'Ended',
};

/** Splits an ISO instant into the value pairs <input type="date"/"time"> want. */
export function toDateTimeInputs(value: string): { date: string; time: string } {
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

/** Local date + time strings -> ISO instant. Returns null if unparseable. */
export function fromDateTimeInputs(date: string, time: string): string | null {
  if (!date || !time) return null;
  const parsed = new Date(`${date}T${time}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
