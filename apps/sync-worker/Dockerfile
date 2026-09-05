# syntax=docker/dockerfile:1.7
# The sync-worker ships inside the API image (same workspace build) and is started with `worker`.
# This Dockerfile exists so the service can be built/tagged independently if desired.
# Build context must be the repository root:  docker build -f apps/sync-worker/Dockerfile .
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/sync-worker/package.json apps/sync-worker/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/db/prisma packages/db/prisma
COPY packages/translation-providers/package.json packages/translation-providers/

FROM base AS build
RUN pnpm install --frozen-lockfile --filter @jumaah/sync-worker... --filter @jumaah/db...
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/db packages/db
COPY apps/sync-worker apps/sync-worker
RUN pnpm --filter @jumaah/shared build && pnpm --filter @jumaah/db build && pnpm --filter @jumaah/sync-worker build

FROM base AS prod
ENV NODE_ENV=production
RUN pnpm install --frozen-lockfile --prod --filter @jumaah/sync-worker... --filter @jumaah/db... \
 && pnpm --filter @jumaah/db exec prisma generate
RUN rm -rf node_modules/.pnpm/typescript@* pnpm-lock.yaml
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/db/dist packages/db/dist
COPY --from=build /app/apps/sync-worker/dist apps/sync-worker/dist

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
RUN apk upgrade --no-cache && apk add --no-cache tini
COPY --from=prod --chown=node:node /app /app
WORKDIR /app
USER node
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/sync-worker/dist/main.js"]
