#!/usr/bin/env bash
# =============================================================================
# LIIMS Deployment Script
# Usage: ./scripts/deploy.sh [--prod] [--seed] [--no-build]
#
# Flags:
#   --prod      Use production compose overrides
#   --seed      Run database seed after migration
#   --no-build  Skip image rebuild (use existing images)
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# Defaults
USE_PROD=false
RUN_SEED=false
BUILD=true

# Parse flags
for arg in "$@"; do
    case $arg in
        --prod)    USE_PROD=true ;;
        --seed)    RUN_SEED=true ;;
        --no-build) BUILD=false ;;
        *)         echo "Unknown flag: $arg"; exit 1 ;;
    esac
done

# Compose command
if [ "$USE_PROD" = true ]; then
    COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
    echo "==> Deploying with PRODUCTION overrides"
else
    COMPOSE="docker compose"
    echo "==> Deploying with default (dev) config"
fi

# Verify .env exists
if [ ! -f .env ]; then
    echo "ERROR: .env file not found. Copy .env.example to .env and configure it."
    exit 1
fi

# Step 1: Build images
if [ "$BUILD" = true ]; then
    echo ""
    echo "==> Step 1/5: Building images..."
    $COMPOSE build --parallel
else
    echo ""
    echo "==> Step 1/5: Skipping build (--no-build)"
fi

# Step 2: Start database and redis first
echo ""
echo "==> Step 2/5: Starting database and Redis..."
$COMPOSE up -d postgres redis
echo "    Waiting for PostgreSQL health check..."
$COMPOSE exec postgres sh -c 'until pg_isready -U liims -d liims; do sleep 1; done'
echo "    PostgreSQL is ready."

# Step 3: Run Alembic migrations
echo ""
echo "==> Step 3/5: Running database migrations..."
$COMPOSE run --rm --no-deps api \
    alembic upgrade head
echo "    Migrations complete."

# Step 4: Optionally seed the database
if [ "$RUN_SEED" = true ]; then
    echo ""
    echo "==> Step 4/5: Seeding database..."
    $COMPOSE run --rm --no-deps api \
        python -m app.seed
    echo "    Seed complete."
else
    echo ""
    echo "==> Step 4/5: Skipping seed (use --seed to run)"
fi

# Step 5: Start all services
echo ""
echo "==> Step 5/5: Starting all services..."
$COMPOSE up -d

echo ""
echo "============================================"
echo "  Deployment complete!"
echo "============================================"
echo ""
echo "Services:"
$COMPOSE ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
echo ""
echo "Logs:  $COMPOSE logs -f"
echo "Stop:  $COMPOSE down"
