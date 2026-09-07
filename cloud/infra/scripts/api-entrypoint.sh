#!/bin/sh
# Entrypoint for the Jumaah Cloud API image. Usage: api-entrypoint.sh [api|migrate|seed]
set -eu
cd /app

wait_for_db() {
  i=0
  until (cd packages/cloud-db && node -e "const {PrismaClient}=require('./generated/client');new PrismaClient().\$queryRaw\`SELECT 1\`.then(()=>process.exit(0)).catch(()=>process.exit(1))") >/dev/null 2>&1; do
    i=$((i+1))
    if [ "$i" -gt 60 ]; then echo "database not reachable"; exit 1; fi
    echo "waiting for database… ($i)"; sleep 2
  done
}

migrate() {
  echo "applying migrations"
  (cd packages/cloud-db && ./node_modules/.bin/prisma migrate deploy)
}

case "${1:-api}" in
  api)
    wait_for_db
    migrate
    if [ "${SEED_ON_START:-0}" = "1" ]; then
      echo "seeding (SEED_ON_START=1)"
      (cd packages/cloud-db && node dist/seed.js) || echo "seed skipped/failed (non-fatal)"
    fi
    exec node apps/api/dist/server.js
    ;;
  migrate)
    wait_for_db
    migrate
    ;;
  seed)
    wait_for_db
    exec sh -c "cd packages/cloud-db && node dist/seed.js"
    ;;
  *)
    exec "$@"
    ;;
esac
