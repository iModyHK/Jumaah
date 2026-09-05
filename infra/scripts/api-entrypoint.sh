#!/bin/sh
# Entrypoint for the API image. Usage: api-entrypoint.sh [api|worker|migrate|seed]
# No package manager at runtime: the Prisma CLI is called from the workspace bin so an offline mosque server still migrates.
set -eu
cd /app

wait_for_db() {
  i=0
  until (cd packages/db && node -e "const {PrismaClient}=require('@prisma/client');new PrismaClient().\$queryRaw\`SELECT 1\`.then(()=>process.exit(0)).catch(()=>process.exit(1))") >/dev/null 2>&1; do
    i=$((i+1))
    if [ "$i" -gt 60 ]; then echo "database not reachable"; exit 1; fi
    echo "waiting for database… ($i)"; sleep 2
  done
}

case "${1:-api}" in
  api)
    wait_for_db
    echo "applying migrations"
    (cd packages/db && ./node_modules/.bin/prisma migrate deploy)
    if [ "${SEED_ON_START:-0}" = "1" ]; then
      echo "seeding (SEED_ON_START=1)"
      (cd packages/db && node dist/seed.js) || echo "seed skipped/failed (non-fatal)"
    fi
    exec node apps/api/dist/server.js
    ;;
  worker)
    wait_for_db
    exec node apps/sync-worker/dist/main.js
    ;;
  migrate)
    wait_for_db
    exec sh -c "cd packages/db && ./node_modules/.bin/prisma migrate deploy"
    ;;
  seed)
    wait_for_db
    exec sh -c "cd packages/db && node dist/seed.js"
    ;;
  *)
    exec "$@"
    ;;
esac
