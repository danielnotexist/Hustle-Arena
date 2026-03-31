import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { serviceRoleClient } from './supabase';

let ioServer: Server | null = null;

export function initializeSocketServer(server: HttpServer, corsOrigin: string): Server {
  ioServer = new Server(server, {
    cors: {
      origin: corsOrigin,
      credentials: true,
    },
  });

  ioServer.use(async (socket, next) => {
    try {
      const token = typeof socket.handshake.auth.token === 'string' ? socket.handshake.auth.token : '';

      if (!token) {
        next(new Error('Missing auth token'));
        return;
      }

      const { data, error } = await serviceRoleClient.auth.getUser(token);

      if (error || !data.user) {
        next(new Error('Invalid auth token'));
        return;
      }

      socket.data.userId = data.user.id;
      next();
    } catch (error) {
      next(error as Error);
    }
  });

  ioServer.on('connection', (socket) => {
    const userId = socket.data.userId as string;
    socket.join(getUserRoom(userId));
    socket.join('community');

    socket.on('match:subscribe', (matchId: string) => {
      if (typeof matchId === 'string' && matchId.length > 0) {
        socket.join(getMatchRoom(matchId));
      }
    });

    socket.on('match:unsubscribe', (matchId: string) => {
      if (typeof matchId === 'string' && matchId.length > 0) {
        socket.leave(getMatchRoom(matchId));
      }
    });
  });

  return ioServer;
}

function getUserRoom(userId: string) {
  return `user:${userId}`;
}

function getMatchRoom(matchId: string) {
  return `match:${matchId}`;
}

export function emitUserEvent(userId: string, event: string, payload: unknown) {
  ioServer?.to(getUserRoom(userId)).emit(event, payload);
}

export function emitMatchEvent(matchId: string, event: string, payload: unknown) {
  ioServer?.to(getMatchRoom(matchId)).emit(event, payload);
}

export function emitCommunityEvent(event: string, payload: unknown) {
  ioServer?.to('community').emit(event, payload);
}
