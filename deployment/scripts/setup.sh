#!/bin/bash
# ── ClearNews — Initial Server Setup ──────────────────────────────────
#
# One-time setup script for a fresh DigitalOcean droplet.
# Run as root from /opt/app after cloning the repo.
#
# What this does:
#   1. Installs Docker, Docker Compose, nginx, and certbot
#   2. Creates data/log directories for persistence
#   3. Sets up temporary HTTP-only nginx config (replaced by setup-ssl.sh)
#   4. Creates .env.production from template
#   5. Builds and starts Docker containers
#
# Usage:
#   cd /opt/app
#   bash deployment/scripts/setup.sh

set -e

echo "========================================"
echo "ClearNews — Initial Server Setup"
echo "========================================"
echo ""

# ── Verify location ───────────────────────────────────────────────────
if [ ! -f "deployment/docker/docker-compose.prod.yml" ]; then
    echo "ERROR: Run this from /opt/app (the repo root)"
    echo "  cd /opt/app && bash deployment/scripts/setup.sh"
    exit 1
fi

# ── Install system packages ───────────────────────────────────────────
echo "📦 Installing system packages..."
apt-get update
apt-get install -y nginx curl certbot python3-certbot-nginx

# Install Docker if not present
if ! command -v docker &> /dev/null; then
    echo "🐳 Installing Docker..."
    curl -fsSL https://get.docker.com | bash
fi

# Install Docker Compose plugin if not present
if ! docker compose version &> /dev/null; then
    echo "🐳 Installing Docker Compose plugin..."
    apt-get install -y docker-compose-plugin
fi

echo "✅ System packages installed"

# ── Create persistent directories ─────────────────────────────────────
echo ""
echo "📁 Creating data directories..."
mkdir -p /opt/app/logs
chown -R 1000:1000 /opt/app/logs
chmod 750 /opt/app/logs
echo "✅ Directories created: /opt/app/logs"

# ── Create .env.production ────────────────────────────────────────────
if [ ! -f "deployment/.env.production" ]; then
    echo ""
    echo "📝 Creating .env.production from template..."
    cp deployment/.env.production.example deployment/.env.production

    echo "✅ .env.production created"
    echo "   Edit to add API keys: nano /opt/app/deployment/.env.production"
else
    echo ""
    echo "⏭️  .env.production already exists, skipping"
fi

# ── Temporary HTTP-only nginx config ──────────────────────────────────
# This allows Let's Encrypt domain verification before we have SSL certs.
# setup-ssl.sh will replace this with the full HTTPS config.
echo ""
echo "🌐 Setting up temporary nginx config (HTTP only)..."

cat > /etc/nginx/sites-available/clearnews <<'NGINX'
server {
    listen 80;
    server_name getclearnews.com www.getclearnews.com;

    # Backend API
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }

    # Health check
    location /health {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }

    # Frontend
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
NGINX

# Remove default nginx site, enable clearnews
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/clearnews /etc/nginx/sites-enabled/clearnews

nginx -t && systemctl restart nginx
echo "✅ Nginx configured (HTTP only — run setup-ssl.sh next for HTTPS)"

# ── Build and start Docker containers ─────────────────────────────────
echo ""
echo "🐳 Building Docker containers (this may take a few minutes)..."
cd /opt/app/deployment/docker
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
    DROPLET_IP=$(curl -s http://169.254.169.254/metadata/v1/interfaces/public/0/ipv4/address 2>/dev/null || hostname -I | awk '{print $1}')

    echo ""
    echo "========================================"
    echo "✅ Setup Complete!"
    echo "========================================"
    echo ""
    echo "Services running:"
    echo "  Backend:  http://$DROPLET_IP:8000/health (internal)"
    echo "  Frontend: http://$DROPLET_IP:3000 (internal)"
    echo "  Site:     http://getclearnews.com (after DNS propagation)"
    echo ""
    echo "Next steps:"
    echo "  1. Verify DNS points to this server: dig getclearnews.com"
    echo "  2. Run SSL setup: bash /opt/app/deployment/scripts/setup-ssl.sh"
    echo "  3. Run firewall setup: bash /opt/app/deployment/scripts/setup-firewall.sh"
else
    echo ""
    echo "⚠️  One or more containers failed to start!"
    echo "  Backend: $BACKEND_STATUS"
    echo "  Frontend: $FRONTEND_STATUS"
    echo ""
    echo "Check logs:"
    echo "  docker logs clearnews-backend"
    echo "  docker logs clearnews-frontend"
fi
