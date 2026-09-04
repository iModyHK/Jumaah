import type { PrismaClient } from '@jumaah/db';
import type { Redis } from 'ioredis';
import type { Server as SocketServer } from 'socket.io';
import type { ClientToServerEvents, InterServerEvents, ServerToClientEvents, SocketData } from '@jumaah/shared';
import type { FastifyBaseLogger } from 'fastify';
import type { Config } from '../config.js';

export type IO = SocketServer<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export interface AppContext {
  db: PrismaClient;
  redis: Redis;
  config: Config;
  log: FastifyBaseLogger;
  io: IO;
}

export interface RequestUser {
  id: string;
  email: string;
  role: 'SUPER_ADMIN' | 'MOSQUE_ADMIN' | 'TRANSLATOR' | 'IMAM' | 'DISPLAY';
  tenantId: string | null;
  impersonating?: boolean;
}

declare module 'fastify' {
  interface FastifyInstance {
    ctx: AppContext;
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (...roles: RequestUser['role'][]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    user: RequestUser | null;
    /** Resolved tenant id for the request (user's tenant, or x-tenant-id for super admins). */
    tenantId: string;
  }
}
