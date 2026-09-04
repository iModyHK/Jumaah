import { createPrisma, encryptSecret, apiKeyHint } from '@jumaah/db';
import { loadConfig } from './config.js';
import { buildApp } from './app.js';
import { createRedis } from './lib/redis.js';

async function main() {
  const config = loadConfig();
  const db = createPrisma(config.DATABASE_URL);
  const redis = createRedis(config.REDIS_URL, 'main');
  const pub = createRedis(config.REDIS_URL, 'pub');
  const sub = createRedis(config.REDIS_URL, 'sub');

  const app = await buildApp({ config, db, redis, pub, sub });

  await bootstrapGlobalProviders(db, config, app.log);

  await app.listen({ port: config.API_PORT, host: config.API_HOST });
  app.log.info({ mode: config.DEPLOYMENT_MODE, version: config.IMAGE_TAG }, `Jumaah API listening on ${config.API_HOST}:${config.API_PORT}`);

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    try {
      await app.close();
      await db.$disconnect();
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

/** On first start, turn env-provided API keys into global (platform) provider configs. */
async function bootstrapGlobalProviders(db: ReturnType<typeof createPrisma>, config: ReturnType<typeof loadConfig>, log: { info: (o: unknown, m?: string) => void }) {
  const candidates: Array<{ type: 'ANTHROPIC' | 'OPENAI' | 'GOOGLE' | 'DEEPL' | 'LIBRETRANSLATE' | 'OLLAMA'; key?: string; baseUrl?: string; model?: string; priority: number; name: string }> = [
    { type: 'ANTHROPIC', key: config.ANTHROPIC_API_KEY, model: 'claude-opus-5', priority: 10, name: 'Anthropic Claude (central)' },
    { type: 'OPENAI', key: config.OPENAI_API_KEY, model: 'gpt-4.1', priority: 20, name: 'OpenAI (central)' },
    { type: 'GOOGLE', key: config.GOOGLE_TRANSLATE_API_KEY, priority: 30, name: 'Google Translate (central)' },
    { type: 'DEEPL', key: config.DEEPL_API_KEY, priority: 40, name: 'DeepL (central)' },
    { type: 'LIBRETRANSLATE', baseUrl: config.LIBRETRANSLATE_URL, priority: 60, name: 'LibreTranslate (local)' },
    { type: 'OLLAMA', baseUrl: config.OLLAMA_URL, model: config.OLLAMA_MODEL ?? 'qwen2.5:7b', priority: 70, name: 'Ollama (local)' },
  ];
  for (const c of candidates) {
    const needsKey = ['ANTHROPIC', 'OPENAI', 'GOOGLE', 'DEEPL'].includes(c.type);
    if (needsKey && !c.key) continue;
    if (!needsKey && !c.baseUrl) continue;
    const exists = await db.providerConfig.findFirst({ where: { tenantId: null, type: c.type } });
    if (exists) continue;
    await db.providerConfig.create({
      data: {
        tenantId: null,
        type: c.type,
        name: c.name,
        apiKeyEncrypted: c.key ? encryptSecret(c.key, config.ENCRYPTION_KEY) : null,
        apiKeyHint: c.key ? apiKeyHint(c.key) : null,
        baseUrl: c.baseUrl ?? null,
        model: c.model ?? null,
        priority: c.priority,
        enabled: true,
      },
    });
    log.info({ type: c.type }, 'bootstrapped global provider from env');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
