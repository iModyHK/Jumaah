import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import type { PrismaClient } from '@jumaah/db';
import type { Redis } from 'ioredis';
import { ZodError } from 'zod';
import type { Config } from './config.js';
import { HttpError } from './lib/errors.js';
import type { AppContext } from './lib/context.js';
import { authPlugin } from './plugins/auth.js';
import { attachSocketHandlers, createSocketServer } from './realtime/socket.js';
import { auditRoutes } from './routes/audit.js';
import { authRoutes } from './routes/auth.js';
import { backupRoutes } from './routes/backups.js';
import { displayRoutes } from './routes/displays.js';
import { glossaryRoutes } from './routes/glossary.js';
import { healthRoutes } from './routes/health.js';
import { khutbahRoutes } from './routes/khutbahs.js';
import { libraryRoutes } from './routes/library.js';
import { paragraphRoutes } from './routes/paragraphs.js';
import { providerRoutes } from './routes/providers.js';
import { publicRoutes } from './routes/public.js';
import { sessionRoutes } from './routes/sessions.js';
import { syncRoutes } from './routes/sync.js';
import { tenantRoutes } from './routes/tenants.js';
import { translationRoutes } from './routes/translations.js';
import { userRoutes } from './routes/users.js';

export interface BuildDeps {
  config: Config;
  db: PrismaClient;
  redis: Redis;
  pub: Redis;
  sub: Redis;
}

export async function buildApp(deps: BuildDeps): Promise<FastifyInstance> {
  const { config } = deps;
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      ...(config.isProd || process.env.NODE_ENV === 'test' ? {} : { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } } }),
    },
    trustProxy: true,
    bodyLimit: 25 * 1024 * 1024,
    disableRequestLogging: process.env.NODE_ENV === 'test',
  });

  const io = createSocketServer(app.server, { redisUrl: config.REDIS_URL, corsOrigins: config.corsOrigins, pub: deps.pub, sub: deps.sub });
  const ctx: AppContext = { db: deps.db, redis: deps.redis, config, log: app.log, io };
  app.decorate('ctx', ctx);

  await app.register(helmet, { contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } });
  await app.register(cors, {
    origin: config.corsOrigins.length ? config.corsOrigins : true,
    credentials: true,
    exposedHeaders: ['content-disposition'],
  });
  await app.register(rateLimit, {
    global: true,
    max: config.RATE_LIMIT_GENERAL,
    timeWindow: '1 minute',
    redis: deps.redis,
    nameSpace: 'jumaah:rl:',
    keyGenerator: (req) => req.user?.id ?? req.ip,
  });
  await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024, files: 1 } });
  await app.register(authPlugin);

  app.setErrorHandler((err: Error & { statusCode?: number; code?: string }, request, reply) => {
    if (err instanceof HttpError) {
      return reply.code(err.status).send({ error: { code: err.code, message: err.message, details: err.details } });
    }
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Validation failed', details: err.issues } });
    }
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status === 429) return reply.code(429).send({ error: { code: 'RATE_LIMITED', message: 'Too many requests' } });
    if (status >= 500) request.log.error({ err }, 'unhandled error');
    return reply.code(status).send({
      error: { code: status >= 500 ? 'INTERNAL' : ((err as { code?: string }).code ?? 'ERROR'), message: status >= 500 && config.isProd ? 'Internal error' : err.message },
    });
  });

  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Route not found' } }));

  await app.register(
    async (api) => {
      await api.register(healthRoutes);
      await api.register(authRoutes, { prefix: '/auth' });
      await api.register(tenantRoutes);
      await api.register(userRoutes);
      await api.register(khutbahRoutes);
      await api.register(paragraphRoutes);
      await api.register(translationRoutes);
      await api.register(glossaryRoutes);
      await api.register(providerRoutes);
      await api.register(displayRoutes);
      await api.register(sessionRoutes);
      await api.register(publicRoutes);
      await api.register(libraryRoutes);
      await api.register(auditRoutes);
      await api.register(backupRoutes);
      await api.register(syncRoutes);
    },
    { prefix: '/api' },
  );

  app.addHook('onReady', async () => {
    attachSocketHandlers(ctx);
  });
  app.addHook('onClose', async () => {
    io.close();
  });

  return app;
}
