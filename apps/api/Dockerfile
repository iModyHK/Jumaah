# syntax=docker/dockerfile:1.7
# Builds the API (and the sync-worker, which shares this image: `CMD ["worker"]`).
#
# Stages:  base (manifests) -> build (full install, tsc)  ->  prod (production install + prisma generate + dist)  ->  runtime
# The runtime image carries no package manager, no compilers and no dev dependencies; Prisma's CLI is
# a production dependency of @jumaah/db because `migrate deploy` runs on every start (also offline).
# ---- base ---------------------------------------------------------------------
FROM node:26-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/sync-worker/package.json apps/sync-worker/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/db/prisma packages/db/prisma
COPY packages/translation-providers/package.json packages/translation-providers/

# ---- build --------------------------------------------------------------------
FROM base AS build
RUN pnpm install --frozen-lockfile --filter @jumaah/api... --filter @jumaah/sync-worker... --filter @jumaah/db...
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

# ---- prod: production node_modules + compiled output only ---------------------
FROM base AS prod
ENV NODE_ENV=production
RUN pnpm install --frozen-lockfile --prod --filter @jumaah/api... --filter @jumaah/sync-worker... --filter @jumaah/db... \
 && pnpm --filter @jumaah/db exec prisma generate
# TypeScript is only an optional peer of the Prisma CLI (needed for prisma.config.ts, which this project does not use).
RUN rm -rf node_modules/.pnpm/typescript@* pnpm-lock.yaml
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/db/dist packages/db/dist
COPY --from=build /app/packages/translation-providers/dist packages/translation-providers/dist
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/sync-worker/dist apps/sync-worker/dist

# ---- runtime ------------------------------------------------------------------
FROM node:26-alpine AS runtime
ENV NODE_ENV=production
RUN apk upgrade --no-cache && apk add --no-cache tini && mkdir -p /app/backups && chown node:node /app/backups
COPY --from=prod --chown=node:node /app /app
COPY --chmod=755 infra/scripts/api-entrypoint.sh /usr/local/bin/api-entrypoint.sh
WORKDIR /app
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 CMD wget -qO- http://127.0.0.1:4000/api/health >/dev/null || exit 1
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/api-entrypoint.sh"]
CMD ["api"]
