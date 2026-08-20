import type { Server as HttpServer } from 'node:http';
import { Server as SocketServer } from 'socket.io';
import cookie from 'cookie';
import { env } from '../env.js';
import { prisma } from './prisma.js';
import { readSession } from './auth.js';

/**
 * Live dashboard updates.
 *
 * One room per event, named `event:<id>`. A check-in emits into that room and
 * the organizer's dashboard re-reads its stats — the socket carries the news,
 * the HTTP endpoint stays the single source of truth. That avoids two ways of
 * computing the same numbers drifting apart.
 *
 * Sockets are authenticated with the same session cookie as the REST API, and
 * joining a room requires owning the event: check-in names are organizer-only
 * data, and a WebSocket must not become the way around that.
 */

let io: SocketServer | null = null;

export interface CheckInEvent {
  eventId: string;
  attendeeName: string;
  checkedInAt: string;
  stationId: string | null;
}

export function initRealtime(server: HttpServer): SocketServer {
  io = new SocketServer(server, {
    cors: {
      origin: env.corsOrigins.length > 0 ? env.corsOrigins : true,
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    const cookies = cookie.parse(socket.handshake.headers.cookie ?? '');
    const session = readSession(cookies);

    if (!session) {
      socket.emit('unauthorized', { message: 'Log in to receive live updates.' });
      socket.disconnect(true);
      return;
    }

    socket.on('join-event', async (eventId: unknown, ack?: (result: { ok: boolean }) => void) => {
      if (typeof eventId !== 'string') {
        ack?.({ ok: false });
        return;
      }

      // Ownership check, exactly as the REST endpoints do it.
      const event = await prisma.event.findUnique({
        where: { id: eventId },
        select: { organizerId: true },
      });
      if (!event || event.organizerId !== session.sub) {
        ack?.({ ok: false });
        return;
      }

      await socket.join(`event:${eventId}`);
      ack?.({ ok: true });
    });

    socket.on('leave-event', async (eventId: unknown) => {
      if (typeof eventId === 'string') await socket.leave(`event:${eventId}`);
    });
  });

  return io;
}

/** Called after a check-in commits. Never throws — a dead socket layer must not fail a scan. */
export function emitCheckIn(payload: CheckInEvent): void {
  try {
    io?.to(`event:${payload.eventId}`).emit('check-in', payload);
  } catch (error) {
    console.error('[realtime] failed to emit check-in:', error);
  }
}

export function closeRealtime(): Promise<void> {
  const server = io;
  io = null;
  return server ? new Promise((resolve) => server.close(() => resolve())) : Promise.resolve();
}
