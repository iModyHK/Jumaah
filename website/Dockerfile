FROM node:20-alpine AS build
WORKDIR /app
COPY build.mjs ./
COPY src ./src
COPY assets ./assets
ARG TURNSTILE_SITE_KEY
ARG SITE_URL=https://www.jumaah.net
ARG SOCIAL_PROOF=0
ARG APP_VERSION
RUN node build.mjs

FROM node:20-alpine
WORKDIR /app
COPY server.mjs ./
COPY shared ./shared
COPY --from=build /app/dist ./dist
ENV NODE_ENV=production PORT=8080 TRUST_PROXY=1
EXPOSE 8080
USER node
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
CMD ["node", "server.mjs"]
