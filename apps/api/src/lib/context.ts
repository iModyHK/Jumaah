import type { PrismaClient } from '@jumaah/db';
import type { Redis } from 'ioredis';
import type { Server as SocketServer } from 'socket.io';
import type { ClientToServerEvents, InterServerEvents, ServerToClientEvents, SocketData } from '@jumaah/core';
import type { FastifyBaseLogger } from 'fastify';
import type { Config } from '../config.js';
import type { CoreHooks } from './extensions.js';

export type IO = SocketServer<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export interface AppContext {
  db: PrismaClient;
  redis: Redis;
  config: Config;
  log: FastifyBaseLogger;
  io: IO;
  /** Extension hooks (empty on the Community Edition). */
  hooks: CoreHooks;
}

export interface RequestUser {
  id: string;
  email: string;
  role: 'SUPER_ADMIN' | 'MOSQUE_ADMIN' | 'TRANSLATOR' | 'IMAM' | 'DISPLAY';
  tenantId: string | null;
  impersonating?: boolean;
  /** Not a person (an API key): audit rows carry no user id. */
  virtual?: boolean;
  /** Data an extension attached (from the token or the liveness check). */
  ext?: Record<string, unknown>;
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
    /** Tenant slug an extension derived from the Host header (per-mosque hosts), else null. */
    hostSlug: string | null;
  }
}
