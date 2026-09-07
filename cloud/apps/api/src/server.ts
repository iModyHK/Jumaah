/** Jumaah Cloud API: the Community API with the cloud extension and the cloud database client. */
import { bootstrapGlobalProviders, buildApp, createRedis, loadConfig, loadDotEnv } from '@jumaah/api';
import { cloudExtension, loadCloudConfig } from '@jumaah/cloud-api';
import { asCoreDb, createPrisma } from '@jumaah/cloud-db';

async function main() {
  loadDotEnv();
  const config = loadCloudConfig(loadConfig());
  const cloudDb = createPrisma(config.DATABASE_URL);
  const db = asCoreDb(cloudDb);
  const redis = createRedis(config.REDIS_URL, 'main');
  const pub = createRedis(config.REDIS_URL, 'pub');
  const sub = createRedis(config.REDIS_URL, 'sub');

  const app = await buildApp({ config, db, redis, pub, sub }, { extensions: [cloudExtension(config)] });
  await bootstrapGlobalProviders(db, config, app.log);
  await app.listen({ port: config.API_PORT, host: config.API_HOST });
  app.log.info({ mode: 'cloud', version: config.IMAGE_TAG }, `Jumaah Cloud API listening on ${config.API_HOST}:${config.API_PORT}`);

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    try {
      await app.close();
      await cloudDb.$disconnect();
      redis.disconnect();
      pub.disconnect();
      sub.disconnect();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'shutdown error');
      process.exit(1);
    }
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
