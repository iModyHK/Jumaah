# syntax=docker/dockerfile:1.7
# Jumaah Cloud API: the Community API (community/ submodule) with the cloud extension.
# Build context: the jumaah-site repository root, with the submodule checked out.
#   docker build -f infra/api.Dockerfile --build-arg APP_VERSION=1.2.0 .
# ---- base ---------------------------------------------------------------------
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY community/packages/jumaah-core/package.json community/packages/jumaah-core/
COPY community/packages/db/package.json community/packages/db/
COPY community/packages/db/prisma community/packages/db/prisma
COPY community/packages/translation-providers/package.json community/packages/translation-providers/
COPY community/apps/api/package.json community/apps/api/
COPY packages/cloud-shared/package.json packages/cloud-shared/
COPY packages/cloud-db/package.json packages/cloud-db/
COPY packages/cloud-db/prisma packages/cloud-db/prisma
COPY packages/cloud-db/scripts packages/cloud-db/scripts
COPY packages/cloud-api/package.json packages/cloud-api/
COPY apps/api/package.json apps/api/

# ---- build --------------------------------------------------------------------
FROM base AS build
RUN pnpm install --frozen-lockfile --filter @jumaah/cloud-server...
COPY tsconfig.base.json ./
COPY community/tsconfig.base.json community/
COPY community/packages/jumaah-core community/packages/jumaah-core
COPY community/packages/db community/packages/db
COPY community/packages/translation-providers community/packages/translation-providers
COPY community/apps/api community/apps/api
COPY packages/cloud-shared packages/cloud-shared
COPY packages/cloud-db packages/cloud-db
COPY packages/cloud-api packages/cloud-api
COPY apps/api apps/api
RUN pnpm --filter @jumaah/core build \
 && pnpm --filter @jumaah/db build \
 && pnpm --filter @jumaah/translation-providers build \
 && pnpm --filter @jumaah/api build \
 && pnpm --filter @jumaah/cloud-shared build \
 && pnpm --filter @jumaah/cloud-db build \
 && pnpm --filter @jumaah/cloud-api build \
 && pnpm --filter @jumaah/cloud-server build

# ---- prod: production node_modules + compiled output only ---------------------
FROM base AS prod
ENV NODE_ENV=production
RUN pnpm install --frozen-lockfile --prod --filter @jumaah/cloud-server... \
 && pnpm --filter @jumaah/db exec prisma generate \
 && pnpm --filter @jumaah/cloud-db generate
RUN rm -rf node_modules/.pnpm/typescript@* pnpm-lock.yaml
COPY --from=build /app/community/packages/jumaah-core/dist community/packages/jumaah-core/dist
COPY --from=build /app/community/packages/db/dist community/packages/db/dist
COPY --from=build /app/community/packages/translation-providers/dist community/packages/translation-providers/dist
COPY --from=build /app/community/apps/api/dist community/apps/api/dist
COPY --from=build /app/packages/cloud-shared/dist packages/cloud-shared/dist
COPY --from=build /app/packages/cloud-db/dist packages/cloud-db/dist
COPY --from=build /app/packages/cloud-api/dist packages/cloud-api/dist
COPY --from=build /app/apps/api/dist apps/api/dist

# ---- runtime ------------------------------------------------------------------
FROM node:22-alpine AS runtime
ARG APP_VERSION=dev
ENV NODE_ENV=production APP_VERSION=$APP_VERSION
RUN apk upgrade --no-cache && apk add --no-cache tini && mkdir -p /app/backups && chown node:node /app/backups
COPY --from=prod --chown=node:node /app /app
COPY --chmod=755 infra/scripts/api-entrypoint.sh /usr/local/bin/api-entrypoint.sh
WORKDIR /app
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 CMD wget -qO- http://127.0.0.1:4000/api/health >/dev/null || exit 1
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/api-entrypoint.sh"]
CMD ["api"]
