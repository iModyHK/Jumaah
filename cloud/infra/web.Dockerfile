# syntax=docker/dockerfile:1.7
# Jumaah Cloud web image: the cloud admin and display apps, the Community imam app, and Caddy with the
# Cloudflare DNS module (one wildcard certificate for every mosque host).
# Build context: the jumaah-site repository root, with the submodule checked out.
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY community/apps/admin/package.json community/apps/admin/
COPY community/apps/imam/package.json community/apps/imam/
COPY community/apps/display/package.json community/apps/display/
COPY community/packages/jumaah-core/package.json community/packages/jumaah-core/
COPY community/packages/ui/package.json community/packages/ui/
COPY packages/cloud-shared/package.json packages/cloud-shared/
COPY packages/cloud-admin/package.json packages/cloud-admin/
COPY packages/cloud-display/package.json packages/cloud-display/
COPY apps/admin/package.json apps/admin/
COPY apps/display/package.json apps/display/
RUN pnpm install --frozen-lockfile --filter @jumaah/cloud-admin-app... --filter @jumaah/cloud-display-app... --filter @jumaah/imam...

FROM deps AS build
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL
COPY tsconfig.base.json ./
COPY community/tsconfig.base.json community/
COPY community/packages/jumaah-core community/packages/jumaah-core
COPY community/packages/ui community/packages/ui
COPY community/apps/admin community/apps/admin
COPY community/apps/imam community/apps/imam
COPY community/apps/display community/apps/display
COPY packages/cloud-shared packages/cloud-shared
COPY packages/cloud-admin packages/cloud-admin
COPY packages/cloud-display packages/cloud-display
COPY apps/admin apps/admin
COPY apps/display apps/display
RUN pnpm --filter @jumaah/core build \
 && pnpm --filter @jumaah/cloud-shared build \
 && pnpm --filter @jumaah/cloud-admin-app build \
 && pnpm --filter @jumaah/imam build \
 && pnpm --filter @jumaah/cloud-display-app build

# Caddy with the Cloudflare DNS module: the wildcard certificate for *.<base domain> needs the DNS challenge.
FROM caddy:2-builder-alpine AS caddy-build
RUN xcaddy build --with github.com/caddy-dns/cloudflare

FROM caddy:2-alpine AS runtime
COPY --from=caddy-build /usr/bin/caddy /usr/bin/caddy
COPY infra/caddy /etc/caddy
COPY --from=build /app/apps/admin/dist /srv/admin
COPY --from=build /app/community/apps/imam/dist /srv/imam
COPY --from=build /app/apps/display/dist /srv/display
EXPOSE 80 443
