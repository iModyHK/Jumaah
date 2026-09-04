# The sync-worker ships inside the API image (same workspace build) and is started with `worker`.
# This Dockerfile exists so the service can be built/tagged independently if desired.
# Build context must be the repository root:  docker build -f apps/sync-worker/Dockerfile .
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/sync-worker/package.json apps/sync-worker/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/translation-providers/package.json packages/translation-providers/
RUN pnpm install --frozen-lockfile --filter @jumaah/sync-worker... --filter @jumaah/db...

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/db packages/db
COPY apps/sync-worker apps/sync-worker
RUN pnpm --filter @jumaah/shared build && pnpm --filter @jumaah/db build && pnpm --filter @jumaah/sync-worker build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
RUN apk add --no-cache tini
WORKDIR /app
COPY --from=build /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/sync-worker ./apps/sync-worker
USER node
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/sync-worker/dist/main.js"]
