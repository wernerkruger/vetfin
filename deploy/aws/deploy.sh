#!/usr/bin/env bash
# Deploy VetFin on a single EC2 instance (Docker Compose).
# Run from the repository root after configuring api/.env.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

COMPOSE="docker compose -f docker-compose.yml -f deploy/aws/docker-compose.ec2.yml"
ENV_FILE="api/.env"

red() { printf '\033[0;31m%s\033[0m\n' "$*"; }
green() { printf '\033[0;32m%s\033[0m\n' "$*"; }

if ! command -v docker >/dev/null 2>&1; then
  red "Docker not found. Run: ./deploy/aws/ec2-setup.sh"
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  red "Missing $ENV_FILE"
  echo "Copy deploy/aws/.env.production.example to api/.env and fill in values."
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

if [[ -z "${DATA_ENCRYPTION_KEY:-}" ]]; then
  red "DATA_ENCRYPTION_KEY is required in api/.env"
  exit 1
fi

if [[ -z "${JWT_SECRET:-}" ]] || [[ "$JWT_SECRET" == "dev-only-change-me-vetfin-jwt-secret-32chars" ]]; then
  red "Set a unique JWT_SECRET in api/.env (min 32 characters)"
  exit 1
fi

if [[ -z "${PLAID_CLIENT_ID:-}" ]] || [[ -z "${PLAID_SECRET:-}" ]]; then
  red "Set PLAID_CLIENT_ID and PLAID_SECRET in api/.env"
  exit 1
fi

MODE="${1:-}"
if [[ -z "$MODE" ]]; then
  if [[ -n "${DOMAIN:-}" ]] && [[ "$PUBLIC_APP_URL" == https://* ]]; then
    MODE="https"
  else
    MODE="http"
  fi
fi

case "$MODE" in
  http)
    green "==> Deploying VetFin (HTTP on port 80)..."
    $COMPOSE --profile http up -d --build --remove-orphans
  ;;
  https)
    if [[ -z "${DOMAIN:-}" ]]; then
      red "HTTPS mode requires DOMAIN in api/.env (e.g. DOMAIN=app.example.com)"
      exit 1
    fi
    green "==> Deploying VetFin (HTTPS for $DOMAIN)..."
    export DOMAIN
    $COMPOSE --profile https up -d --build --remove-orphans
  ;;
  down)
    $COMPOSE --profile http --profile https down
    exit 0
  ;;
  logs)
    $COMPOSE --profile http --profile https logs -f
    exit 0
  ;;
  *)
    echo "Usage: $0 [http|https|down|logs]"
    echo "  http   — port 80 only (Elastic IP, no domain)"
    echo "  https  — Let's Encrypt via Caddy (requires DOMAIN + DNS)"
    exit 1
  ;;
esac

echo ""
green "==> Waiting for health check..."
for _ in $(seq 1 30); do
  if curl -sf http://127.0.0.1/health >/dev/null 2>&1; then
    green "==> VetFin is running."
    if [[ "$MODE" == "https" ]]; then
      echo "    URL: https://${DOMAIN}"
    else
      echo "    URL: http://$(curl -sf http://checkip.amazonaws.com 2>/dev/null || echo '<this-server-ip>')"
    fi
    echo ""
    echo "Useful commands:"
    echo "  docker compose -f docker-compose.yml -f deploy/aws/docker-compose.ec2.yml ps"
    echo "  ./deploy/aws/deploy.sh logs"
    echo "  ./deploy/aws/deploy.sh down"
    exit 0
  fi
  sleep 2
done

red "Health check failed. Logs:"
$COMPOSE --profile "$MODE" logs --tail=50
exit 1
