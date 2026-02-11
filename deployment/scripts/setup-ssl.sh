#!/bin/bash
# ── ClearNews — SSL Certificate Setup ─────────────────────────────────
#
# Obtains Let's Encrypt SSL certificates and switches nginx to HTTPS.
# Run AFTER setup.sh and AFTER DNS is pointing to this server.
#
# Prerequisites:
#   - setup.sh has been run successfully
#   - DNS A records for getclearnews.com and www.getclearnews.com point here
#   - Port 80 is open (for Let's Encrypt verification)
#
# Usage:
#   bash /opt/app/deployment/scripts/setup-ssl.sh

set -e

echo "========================================"
echo "ClearNews — SSL Certificate Setup"
echo "========================================"
echo ""

# ── Get email for Let's Encrypt ───────────────────────────────────────
read -p "Email for Let's Encrypt notifications: " LE_EMAIL
if [ -z "$LE_EMAIL" ]; then
    echo "ERROR: Email is required for Let's Encrypt."
    exit 1
fi

# ── Obtain SSL certificate ────────────────────────────────────────────
echo ""
echo "🔐 Obtaining SSL certificates..."
certbot certonly --nginx \
    -d getclearnews.com \
    -d www.getclearnews.com \
    --non-interactive \
    --agree-tos \
    --email "$LE_EMAIL"

if [ $? -ne 0 ]; then
    echo ""
    echo "❌ Certificate obtain failed!"
    echo "   Verify DNS is pointing to this server: dig getclearnews.com"
    exit 1
fi

echo "✅ SSL certificates obtained"

# ── Switch to production nginx config with HTTPS ──────────────────────
echo ""
echo "🌐 Switching to HTTPS nginx config..."

# Copy the production config
cp /opt/app/deployment/nginx/clearnews.conf /etc/nginx/sites-available/clearnews

# Test and reload
nginx -t
if [ $? -ne 0 ]; then
    echo "❌ Nginx config test failed! Check /etc/nginx/sites-available/clearnews"
    exit 1
fi

systemctl reload nginx
echo "✅ Nginx reloaded with HTTPS"

# ── Verify auto-renewal ──────────────────────────────────────────────
echo ""
echo "🔄 Testing certificate auto-renewal..."
certbot renew --dry-run

echo ""
echo "🔄 Enabling certbot auto-renewal timer..."
systemctl enable certbot.timer
systemctl start certbot.timer

echo ""
echo "========================================"
echo "✅ SSL Setup Complete!"
echo "========================================"
echo ""
echo "Your site is now live at:"
echo "  https://getclearnews.com"
echo ""
echo "Certificates auto-renew via systemd timer."
echo "Manual renewal: certbot renew --force-renewal"
