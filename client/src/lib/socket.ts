import { io, type Socket } from 'socket.io-client';

/**
 * One shared socket for the tab.
 *
 * The server authenticates it with the same session cookie as the REST API —
 * `withCredentials` is what sends that cookie — and only lets an organizer join
 * a room for an event they own.
 */
const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(BASE_URL || undefined, {
      withCredentials: true,
      // Long-poll first, upgrade to WebSocket: works through proxies that would
      // otherwise drop the connection outright.
      transports: ['polling', 'websocket'],
    });
  }
  return socket;
}

export interface LiveCheckIn {
  eventId: string;
  attendeeName: string;
  checkedInAt: string;
  stationId: string | null;
}
