import type { FastifyInstance } from 'fastify';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  const { db, redis, config } = app.ctx;

  app.get('/health', { config: { rateLimit: false } }, async () => ({
    ok: true,
    mode: config.DEPLOYMENT_MODE,
    version: config.IMAGE_TAG,
    time: new Date().toISOString(),
  }));

  app.get('/health/ready', { config: { rateLimit: false } }, async (_request, reply) => {
    const checks: Record<string, 'ok' | string> = {};
    try {
      await db.$queryRaw`SELECT 1`;
      checks.database = 'ok';
    } catch (err) {
      checks.database = (err as Error).message;
    }
    try {
      await redis.ping();
      checks.redis = 'ok';
    } catch (err) {
      checks.redis = (err as Error).message;
    }
    const ok = Object.values(checks).every((v) => v === 'ok');
    return reply.code(ok ? 200 : 503).send({ ok, checks });
  });
}
