# ClearNews — Deployment Guide

## Architecture

```
Internet (HTTPS :443)
    ↓
Nginx (host-level, SSL termination + rate limiting)
    ├── /api/*    → Backend container (FastAPI, port 8000)
    ├── /health   → Backend container
    └── /*        → Frontend container (Next.js, port 3000)
```

- **Host**: DigitalOcean Droplet (Ubuntu 24.04, $6/mo, sfo3)
- **Domain**: getclearnews.com
- **SSL**: Let's Encrypt with auto-renewal
- **Containers**: Docker Compose (backend + frontend)
- **Stateless**: No database — in-memory cache only

---

## One-Time Setup (New Server)

### Prerequisites

1. **Create DigitalOcean Droplet**
   - Image: Ubuntu 24.04 LTS
   - Plan: Basic $6/mo (1 GB RAM, 1 CPU, 25 GB SSD)
   - Region: San Francisco (sfo3)
   - Auth: SSH key (`~/.ssh/id_ed25519.pub`)
   - Hostname: `clearnews-app`

2. **Update DNS** (do this first — propagation takes 5-10 min)
   - `A` record: `@` → `<droplet-ip>` (getclearnews.com)
   - `A` record: `www` → `<droplet-ip>` (www.getclearnews.com)

3. **Add GitHub SSH Key on Droplet**
   ```bash
   ssh root@<droplet-ip>
   ssh-keygen -t ed25519 -f ~/.ssh/github -N ''
   cat ~/.ssh/github.pub
   # Add this key to GitHub: Settings → SSH and GPG keys

   # Configure SSH to use this key for GitHub
   cat >> ~/.ssh/config <<EOF
   Host github.com
     IdentityFile ~/.ssh/github
     IdentitiesOnly yes
   EOF
   ```

4. **Clone Repository**
   ```bash
   mkdir -p /opt/app
   cd /opt/app
   git clone git@github.com:nikhilsi/news-aggregator.git .
   ```

### Run Setup Scripts

```bash
# 1. Initial setup (installs Docker, nginx, builds containers)
bash /opt/app/deployment/scripts/setup.sh

# 2. SSL certificates (run after DNS is propagated)
bash /opt/app/deployment/scripts/setup-ssl.sh

# 3. Firewall + fail2ban
bash /opt/app/deployment/scripts/setup-firewall.sh
```

---

## Deploying Updates

Every time you push code and want to deploy:

```bash
# From your Mac
git push origin main

# SSH into the server and deploy
ssh root@<droplet-ip>
bash /opt/app/deployment/scripts/deploy.sh
```

---

## Useful Commands

```bash
# Container status
cd /opt/app/deployment/docker
docker compose -f docker-compose.prod.yml ps

# View logs
docker logs -f --tail 100 clearnews-backend
docker logs -f --tail 100 clearnews-frontend

# Stream logs from your Mac
bash deployment/scripts/stream-logs.sh <droplet-ip> backend

# Restart a single container
docker restart clearnews-backend

# Rebuild just one service
docker compose -f docker-compose.prod.yml build backend
docker compose -f docker-compose.prod.yml up -d backend

# Nginx
nginx -t                  # Test config
systemctl reload nginx    # Reload after config changes

# SSL
certbot renew --dry-run   # Test renewal
certbot renew --force-renewal  # Force renew now

# Firewall
ufw status verbose
fail2ban-client status sshd
```

---

## Directory Structure (on server)

```
/opt/app/
├── backend/                 # FastAPI app (copied into Docker)
├── web/                     # Next.js app (copied into Docker)
├── deployment/
│   ├── docker/
│   │   ├── Dockerfile.backend
│   │   ├── Dockerfile.frontend
│   │   └── docker-compose.prod.yml
│   ├── nginx/
│   │   └── clearnews.conf   # Host-level nginx config
│   ├── scripts/
│   │   ├── setup.sh         # One-time server setup
│   │   ├── setup-ssl.sh     # SSL certificate setup
│   │   ├── setup-firewall.sh # UFW + fail2ban
│   │   ├── deploy.sh        # Recurring deploys
│   │   └── stream-logs.sh   # Stream remote logs locally
│   ├── .env.production      # API keys (NOT in git)
│   └── .env.production.example
└── logs/
    └── deployments.log      # Deployment history
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Containers won't start | `docker logs clearnews-backend` |
| "No space left on device" | `docker system prune -af && docker volume prune -f` |
| SSL cert expired | `certbot renew --force-renewal && systemctl reload nginx` |
| High memory usage | Check container limits: `docker stats` |
| 502 Bad Gateway | Check if containers are running: `docker ps` |
| DNS not resolving | Wait 10 min, then `dig getclearnews.com` |

---

## Rollback

```bash
ssh root@<droplet-ip>
cd /opt/app
git log --oneline -10           # Find the last good commit
git checkout <commit-hash>
bash /opt/app/deployment/scripts/deploy.sh
```
