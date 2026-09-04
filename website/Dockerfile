FROM node:26-alpine AS build
WORKDIR /app
COPY build.mjs ./
COPY src ./src
COPY assets ./assets
COPY shared ./shared
ARG TURNSTILE_SITE_KEY
ARG SITE_URL=https://www.jumaah.net
ARG SOCIAL_PROOF=0
ARG APP_VERSION
RUN node build.mjs

FROM node:26-alpine
# Pull Alpine security fixes released after the base image was published, and drop npm/yarn/corepack: the server has no
# dependencies, and the bundled npm ships old packages (tar, pacote…) that Trivy flags. Trivy gates the CI build on CRITICAL.
RUN apk upgrade --no-cache && rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /opt/yarn*
WORKDIR /app
COPY server.mjs ./
COPY shared ./shared
COPY --from=build /app/dist ./dist
ENV NODE_ENV=production PORT=8080 TRUST_PROXY=1
EXPOSE 8080
USER node
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
CMD ["node", "server.mjs"]
