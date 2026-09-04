import { Redis } from 'ioredis';

export function createRedis(url: string, name = 'main'): Redis {
  const client = new Redis(url, {
    lazyConnect: false,
    maxRetriesPerRequest: 3,
    enableOfflineQueue: true,
    connectionName: `jumaah-${name}`,
    retryStrategy: (times) => Math.min(times * 200, 5000),
  });
  client.on('error', (err) => {
    // Logged by the app; avoid unhandled 'error' event crashes.
    if (process.env.NODE_ENV !== 'test') console.error(`[redis:${name}]`, err.message);
  });
  return client;
}
