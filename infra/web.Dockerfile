# syntax=docker/dockerfile:1.7
# Builds the three frontends (admin, imam, display) and serves them with Caddy,
# which also reverse-proxies /api and /socket.io to the API container.
# Build context: repository root.  docker build -f infra/web.Dockerfile .
FROM node:26-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY apps/admin/package.json apps/admin/
COPY apps/imam/package.json apps/imam/
COPY apps/display/package.json apps/display/
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
RUN pnpm install --frozen-lockfile --filter @jumaah/admin... --filter @jumaah/imam... --filter @jumaah/display...

FROM deps AS build
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/ui packages/ui
COPY apps/admin apps/admin
COPY apps/imam apps/imam
COPY apps/display apps/display
RUN pnpm --filter @jumaah/shared build \
 && pnpm --filter @jumaah/admin build \
 && pnpm --filter @jumaah/imam build \
 && pnpm --filter @jumaah/display build

FROM caddy:2-alpine AS runtime
COPY infra/caddy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/admin/dist /srv/admin
COPY --from=build /app/apps/imam/dist /srv/imam
COPY --from=build /app/apps/display/dist /srv/display
EXPOSE 80 443
