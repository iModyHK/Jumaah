# syntax=docker/dockerfile:1.7
# Builds the API (and the sync-worker, which shares this image: `CMD ["worker"]`).
# ---- deps ---------------------------------------------------------------------
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/sync-worker/package.json apps/sync-worker/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/translation-providers/package.json packages/translation-providers/
RUN pnpm install --frozen-lockfile --filter @jumaah/api... --filter @jumaah/sync-worker... --filter @jumaah/db...

# ---- build --------------------------------------------------------------------
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/db packages/db
COPY packages/translation-providers packages/translation-providers
COPY apps/api apps/api
COPY apps/sync-worker apps/sync-worker
RUN pnpm --filter @jumaah/shared build \
 && pnpm --filter @jumaah/db build \
 && pnpm --filter @jumaah/translation-providers build \
 && pnpm --filter @jumaah/api build \
 && pnpm --filter @jumaah/sync-worker build

# ---- runtime ------------------------------------------------------------------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
RUN apk add --no-cache tini curl && corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app
COPY --from=build /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml /app/.npmrc ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/api ./apps/api
COPY --from=build /app/apps/sync-worker ./apps/sync-worker
COPY infra/scripts/api-entrypoint.sh /usr/local/bin/api-entrypoint.sh
RUN chmod +x /usr/local/bin/api-entrypoint.sh && mkdir -p /app/backups && chown -R node:node /app
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 CMD curl -fsS http://localhost:4000/api/health || exit 1
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/api-entrypoint.sh"]
CMD ["api"]
