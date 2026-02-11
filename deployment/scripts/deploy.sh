#!/bin/bash
# ── ClearNews — Deploy ────────────────────────────────────────────────
#
# Pulls latest code and rebuilds Docker containers.
# Run on the server for every deployment after initial setup.
#
# Usage:
#   ssh root@<droplet-ip>
#   bash /opt/app/deployment/scripts/deploy.sh

set -e

echo "========================================"
echo "ClearNews — Deploying at $(date)"
echo "========================================"

cd /opt/app

# ── Verify branch ─────────────────────────────────────────────────────
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" != "main" ]; then
    echo "ERROR: Expected branch 'main', currently on '$BRANCH'"
    exit 1
fi

# ── Pull latest code ──────────────────────────────────────────────────
echo ""
echo "📥 Pulling latest code..."
git pull origin main

COMMIT=$(git log --oneline -1)
echo "   Latest commit: $COMMIT"

# ── Rebuild and restart containers ────────────────────────────────────
echo ""
echo "🐳 Stopping containers..."
cd /opt/app/deployment/docker
docker compose -f docker-compose.prod.yml down

echo ""
echo "🔨 Rebuilding containers..."
docker compose -f docker-compose.prod.yml build --no-cache

echo ""
echo "🚀 Starting containers..."
docker compose -f docker-compose.prod.yml up -d

echo ""
echo "⏳ Waiting for services to start..."
sleep 5

# ── Verify ────────────────────────────────────────────────────────────
echo ""
echo "🔍 Checking container status..."
docker compose -f docker-compose.prod.yml ps

BACKEND_STATUS=$(docker inspect --format='{{.State.Status}}' clearnews-backend 2>/dev/null || echo "not found")
FRONTEND_STATUS=$(docker inspect --format='{{.State.Status}}' clearnews-frontend 2>/dev/null || echo "not found")

if [ "$BACKEND_STATUS" = "running" ] && [ "$FRONTEND_STATUS" = "running" ]; then
    echo ""
    echo "========================================"
    echo "✅ Deploy Complete!"
    echo "========================================"
    echo "   Commit: $COMMIT"
    echo "   Site:   https://getclearnews.com"
    echo "   Health: https://getclearnews.com/health"

    # Log the deployment
    echo "$(date '+%Y-%m-%d %H:%M:%S') | $COMMIT" >> /opt/app/logs/deployments.log
else
    echo ""
    echo "⚠️  One or more containers failed to start!"
    echo "  Backend:  $BACKEND_STATUS"
    echo "  Frontend: $FRONTEND_STATUS"
    echo ""
    echo "Check logs:"
    echo "  docker logs clearnews-backend"
    echo "  docker logs clearnews-frontend"
    exit 1
fi
