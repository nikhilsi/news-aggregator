#!/bin/bash
# ── ClearNews — Stream Remote Logs ────────────────────────────────────
#
# Streams real-time Docker logs from production to your local terminal.
# Run from your Mac — connects to the droplet via SSH.
#
# Usage:
#   bash deployment/scripts/stream-logs.sh <droplet-ip> [backend|frontend|all]
#
# Examples:
#   bash deployment/scripts/stream-logs.sh 1.2.3.4              # Default: backend
#   bash deployment/scripts/stream-logs.sh 1.2.3.4 backend      # Backend only
#   bash deployment/scripts/stream-logs.sh 1.2.3.4 frontend     # Frontend only
#   bash deployment/scripts/stream-logs.sh 1.2.3.4 all          # Both services

DROPLET_IP="${1}"
SERVICE="${2:-backend}"

if [ -z "$DROPLET_IP" ]; then
    echo "Usage: bash deployment/scripts/stream-logs.sh <droplet-ip> [backend|frontend|all]"
    exit 1
fi

SSH_KEY="$HOME/.ssh/id_ed25519"

echo "📡 Streaming $SERVICE logs from $DROPLET_IP..."
echo "   Press Ctrl+C to stop"
echo ""

case "$SERVICE" in
    backend)
        ssh -i "$SSH_KEY" root@"$DROPLET_IP" \
            "docker logs -f --tail 100 clearnews-backend"
        ;;
    frontend)
        ssh -i "$SSH_KEY" root@"$DROPLET_IP" \
            "docker logs -f --tail 100 clearnews-frontend"
        ;;
    all)
        ssh -i "$SSH_KEY" root@"$DROPLET_IP" \
            "cd /opt/app/deployment/docker && docker compose -f docker-compose.prod.yml logs -f --tail 100"
        ;;
    *)
        echo "Unknown service: $SERVICE"
        echo "Options: backend, frontend, all"
        exit 1
        ;;
esac
