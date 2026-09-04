#!/usr/bin/env bash
# One-shot installer for a mosque edge server (Debian/Ubuntu, x86_64 or arm64).
# Installs Docker if missing, writes .env with strong secrets, starts the stack and seeds the first admin.
#   curl -fsSL https://raw.githubusercontent.com/iModyHK/Jumaah/main/infra/scripts/edge-install.sh | bash
# or, from a clone:  ./infra/scripts/edge-install.sh
set -euo pipefail

REPO_URL=${REPO_URL:-https://github.com/iModyHK/Jumaah.git}
INSTALL_DIR=${INSTALL_DIR:-/opt/jumaah}
IMAGE_TAG=${IMAGE_TAG:-1.0.0}

if ! command -v docker >/dev/null 2>&1; then
  echo "installing docker…"
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER" || true
fi

if [ ! -d "$INSTALL_DIR/.git" ]; then
  sudo mkdir -p "$INSTALL_DIR" && sudo chown "$USER" "$INSTALL_DIR"
  git clone "$REPO_URL" "$INSTALL_DIR"
fi
cd "$INSTALL_DIR"

rand() { head -c 48 /dev/urandom | base64 | tr -d '\n/+=' | cut -c1-48; }

if [ ! -f .env ]; then
  cp .env.example .env
  LAN_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
  sed -i "s#^JWT_SECRET=.*#JWT_SECRET=$(rand)#" .env
  sed -i "s#^ENCRYPTION_KEY=.*#ENCRYPTION_KEY=$(rand)#" .env
  sed -i "s#^POSTGRES_PASSWORD=.*#POSTGRES_PASSWORD=$(rand)#" .env
  sed -i "s#^NODE_ENV=.*#NODE_ENV=production#" .env
  sed -i "s#^IMAGE_TAG=.*#IMAGE_TAG=$IMAGE_TAG#" .env
  sed -i "s#^PUBLIC_BASE_URL=.*#PUBLIC_BASE_URL=http://${LAN_IP:-localhost}:8080#" .env
  sed -i "s#^SEED_SUPER_ADMIN_PASSWORD=.*#SEED_SUPER_ADMIN_PASSWORD=$(rand | cut -c1-16)#" .env
  sed -i "s#^SEED_DEMO_PASSWORD=.*#SEED_DEMO_PASSWORD=$(rand | cut -c1-16)#" .env
  echo "SEED_ON_START=1" >> .env
  echo ".env written with generated secrets (LAN address: ${LAN_IP:-localhost})"
fi

docker compose -f docker-compose.edge.yml up -d --build
# Seed only on first boot; disable afterwards so restores are never overwritten.
sed -i "s#^SEED_ON_START=.*#SEED_ON_START=0#" .env

echo
echo "Jumaah edge is running:"
grep -E '^(PUBLIC_BASE_URL|SEED_SUPER_ADMIN_EMAIL|SEED_SUPER_ADMIN_PASSWORD|SEED_DEMO_PASSWORD)=' .env
echo "Admin:   \$PUBLIC_BASE_URL/admin/"
echo "Imam:    \$PUBLIC_BASE_URL/imam/"
echo "Display: \$PUBLIC_BASE_URL/display/<token>   (tokens are shown in Admin → Displays)"
