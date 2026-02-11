#!/bin/bash
# ── ClearNews — Firewall Setup ────────────────────────────────────────
#
# Configures UFW firewall and fail2ban for brute-force protection.
# Run AFTER setup.sh and setup-ssl.sh.
#
# What this does:
#   1. UFW: Allow SSH (rate-limited), HTTP, HTTPS — block everything else
#   2. Fail2ban: Protect SSH and nginx from brute-force attacks
#
# Usage:
#   bash /opt/app/deployment/scripts/setup-firewall.sh

set -e

echo "========================================"
echo "ClearNews — Firewall & Security Setup"
echo "========================================"

# ── Check root ────────────────────────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
    echo "ERROR: Run as root (sudo bash ...)"
    exit 1
fi

# ── UFW Firewall ──────────────────────────────────────────────────────
echo ""
echo "🔥 Configuring UFW firewall..."

# Back up existing rules if UFW is active
if ufw status | grep -q "Status: active"; then
    echo "   Backing up current rules..."
    cp /etc/ufw/user.rules /etc/ufw/user.rules.backup.$(date +%Y%m%d) 2>/dev/null || true
fi

ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw limit ssh           # Rate-limited SSH (max 6 connections in 30 seconds)
ufw allow http           # Port 80 (for Let's Encrypt renewals + redirect)
ufw allow https          # Port 443
ufw --force enable

echo "✅ UFW configured"
ufw status verbose

# ── Fail2ban ──────────────────────────────────────────────────────────
echo ""
echo "🛡️  Configuring fail2ban..."

apt-get install -y fail2ban

# Back up existing config
if [ -f /etc/fail2ban/jail.local ]; then
    cp /etc/fail2ban/jail.local /etc/fail2ban/jail.local.backup.$(date +%Y%m%d)
fi

cat > /etc/fail2ban/jail.local <<'JAIL'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

# ── SSH brute-force protection ─────────────────────────────────────
[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 86400
findtime = 600

# ── Nginx rate-limit violation protection ──────────────────────────
[nginx-limit-req]
enabled = true
port = http,https
filter = nginx-limit-req
logpath = /var/log/nginx/error.log
maxretry = 10
bantime = 3600
findtime = 60
JAIL

# Create nginx-limit-req filter if missing
if [ ! -f /etc/fail2ban/filter.d/nginx-limit-req.conf ]; then
    cat > /etc/fail2ban/filter.d/nginx-limit-req.conf <<'FILTER'
[Definition]
failregex = limiting requests, excess: [\d\.]+ by zone ".*", client: <HOST>
ignoreregex =
FILTER
fi

systemctl enable fail2ban
systemctl restart fail2ban

echo "✅ Fail2ban configured"
fail2ban-client status

echo ""
echo "========================================"
echo "✅ Security Setup Complete!"
echo "========================================"
echo ""
echo "Firewall: SSH (rate-limited), HTTP, HTTPS only"
echo "Fail2ban: SSH (3 attempts → 24h ban), Nginx rate limits (10 → 1h ban)"
echo ""
echo "Useful commands:"
echo "  ufw status                              # Firewall status"
echo "  fail2ban-client status sshd             # SSH jail status"
echo "  fail2ban-client set sshd unbanip <IP>   # Unban an IP"
