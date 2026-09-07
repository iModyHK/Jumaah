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
import { isAllowedOrigin } from './lib/host.js';
import { mergeHooks, type ApiExtension } from './lib/extensions.js';
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

export interface BuildOptions {
  /** Extensions (Jumaah Cloud); none on the Community Edition. */
  extensions?: ApiExtension[];
}

export async function buildApp(deps: BuildDeps, options: BuildOptions = {}): Promise<FastifyInstance> {
  const { config } = deps;
  const extensions = options.extensions ?? [];
  const hooks = mergeHooks(extensions);
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      ...(config.isProd || process.env.NODE_ENV === 'test' ? {} : { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } } }),
    },
    trustProxy: true,
    bodyLimit: 25 * 1024 * 1024,
    disableRequestLogging: process.env.NODE_ENV === 'test',
  });

  // Browser origins: the configured list and the platform's own address; extensions may allow more (per-mosque
  // hosts, custom domains).
  const corsOrigin = (origin: string | undefined, cb: (err: Error | null, allow: boolean) => void) => {
    if (isAllowedOrigin(origin, config, !hooks.allowOrigin)) return cb(null, true);
    if (!origin || !hooks.allowOrigin) return cb(null, false);
    hooks.allowOrigin(origin).then(
      (ok) => cb(null, ok),
      () => cb(null, false),
    );
  };
  const io = createSocketServer(app.server, { redisUrl: config.REDIS_URL, corsOrigin, pub: deps.pub, sub: deps.sub });
  const ctx: AppContext = { db: deps.db, redis: deps.redis, config, log: app.log, io, hooks };
  app.decorate('ctx', ctx);
  app.decorateRequest('hostSlug', null);
  if (hooks.hostSlug) {
    const resolveHost = hooks.hostSlug;
    app.addHook('onRequest', async (request) => {
      request.hostSlug = await resolveHost(request);
    });
  }

  await app.register(helmet, { contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } });
  await app.register(cors, {
    origin: corsOrigin,
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
      for (const ext of extensions) if (ext.register) await ext.register(api);
    },
    { prefix: '/api' },
  );

  app.addHook('onReady', async () => {
    attachSocketHandlers(ctx);
    for (const ext of extensions) await ext.onReady?.(ctx);
  });
  app.addHook('onClose', async () => {
    io.close();
  });

  return app;
}
