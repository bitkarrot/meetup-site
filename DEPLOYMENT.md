# Deployment Guide

Complete guide for deploying Nostr-CMS with Swarm Relay.

## Table of Contents
- [Quick Start](#quick-start)
- [Option 1: Combined Deployment](#option-1-combined-deployment-single-domain)
- [Option 2: Separated Deployment](#option-2-separated-deployment-two-domains)
- [Configuration Reference](#configuration-reference)
- [Production Deployment](#production-deployment)
- [Troubleshooting](#troubleshooting)

## Quick Start

Choose your deployment method:

### 🚀 Combined (Recommended)
Single domain, simpler setup, lower cost.
```bash
docker compose -f docker-compose.combined.yml up -d
```

### 🔄 Separated
Two domains, independent scaling.
```bash
docker compose -f docker-compose.separated.yml up -d
```

---

## Option 1: Combined Deployment (Single Domain)

Run Nostr-CMS and Swarm Relay on a single domain/port.

### Without Docker (Local Development)

**Prerequisites:**
- Node.js 18+
- Go 1.23+

**Step 1: Clone and Setup**
```bash
git clone <your-repo-url>
cd cms-meetup-site

# Install frontend dependencies
npm install
```

**Step 2: Build Frontend**
```bash
npm run build:embedded
```

**Step 3: Configure Environment**
```bash
cd swarm

# Create .env file
cat > .env << EOF
RELAY_NAME="My Nostr CMS"
RELAY_PUBKEY="your_pubkey_here"
RELAY_DESCRIPTION="Nostr CMS with Relay"
RELAY_PORT=3334

# Frontend Configuration
SERVE_FRONTEND=true
FRONTEND_BASE_PATH=/
ENABLE_FRONTEND_AUTH=false
NOSTR_JSON_MODE=local

# Frontend Environment Variables
VITE_DEFAULT_RELAY=ws://localhost:3334
VITE_REMOTE_NOSTR_JSON_URL=
VITE_MASTER_PUBKEY=your_pubkey_here

# Database
DB_ENGINE=badger
DB_PATH=./db/

# Blossom (Media Storage)
BLOSSOM_ENABLED=true
BLOSSOM_PATH=blossom/
BLOSSOM_URL=http://localhost:3334
EOF
```

**Step 4: Run Relay with Embedded Frontend**
```bash
go run main.go
```

Access at: `http://localhost:3334`

**Development with Hot Reload:**
```bash
# Terminal 1: Build frontend with watch
npm run build -- --watch

# Terminal 2: Run relay with local filesystem override
cd swarm
export SERVE_FRONTEND=true
export FRONTEND_PATH=../dist
go run main.go
```

### With Docker (Production)

**Step 1: Create Environment File**
```bash
cp .env.combined.example .env
nano .env  # Edit with your configuration
```

**Step 2: Build and Run**
```bash
docker compose -f docker-compose.combined.yml up -d --build
```

**Step 3: Check Logs**
```bash
docker compose -f docker-compose.combined.yml logs -f
```

**Step 4: Access Your Site**
```
http://localhost:3334
```

### Environment Variables for Combined Mode

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SERVE_FRONTEND` | Yes | `false` | Set to `true` to enable Nostr-CMS |
| `FRONTEND_BASE_PATH` | No | `/` | URL path for frontend (use `/` for root) |
| `ENABLE_FRONTEND_AUTH` | No | `false` | Require auth to view frontend |
| `NOSTR_JSON_MODE` | No | `local` | "local" or "remote" nostr.json |
| `VITE_DEFAULT_RELAY` | Yes | - | WebSocket URL for relay |
| `VITE_REMOTE_NOSTR_JSON_URL` | Conditional | - | Required if NOSTR_JSON_MODE=remote |
| `VITE_MASTER_PUBKEY` | Yes | - | Admin pubkey (site owner) |
| `RELAY_PORT` | No | `3334` | Port to run on |
| `DB_ENGINE` | No | `badger` | Database: badger, lmdb, or postgres |
| `BLOSSOM_ENABLED` | No | `true` | Enable media upload for Nostr-CMS |

---

## Option 2: Separated Deployment (Two Domains)

Run frontend and relay as separate services.

### Without Docker (Local Development)

**Step 1: Start Relay**
```bash
cd swarm
cp .env.example .env
nano .env  # Configure your relay

go run main.go
```

Relay runs at: `ws://localhost:3334`

**Step 2: Start Frontend**
```bash
# New terminal
cp .env.example .env
nano .env  # Configure VITE_DEFAULT_RELAY=ws://localhost:3334

npm run dev
```

Frontend runs at: `http://localhost:8080`

### With Docker (Production)

**Step 1: Create Environment File**
```bash
cp .env.separated.example .env
nano .env  # Edit with your configuration
```

**Step 2: Build and Run**
```bash
docker compose -f docker-compose.separated.yml up -d --build
```

**Step 3: Access Services**
```
Frontend: http://localhost:8080
Relay:    ws://localhost:3334
```

---

## Configuration Reference

### Nostr.json Management

**Local Mode** (Default):
- Uses `public/.well-known/nostr.json` on the relay server
- Edit `swarm/public/.well-known/nostr.json` to manage admins
- Best for: Simple deployments, full control

```json
{
  "names": {
    "username": "npub1..."
  }
}
```

**Remote Mode:**
- Uses remote nostr.json URL
- Set `NOSTR_JSON_MODE=remote`
- Set `VITE_REMOTE_NOSTR_JSON_URL` to your nostr.json URL
- Best for: Centralized auth, multiple instances

### Frontend Auth Modes

**Public View** (Default):
- `ENABLE_FRONTEND_AUTH=false`
- Anyone can view the site
- Admin actions require Nostr authentication
- Best for: Public websites, blogs

**Restricted View:**
- `ENABLE_FRONTEND_AUTH=true`
- Only team members can access
- Requires session cookie
- Best for: Private intranets, team portals

### Database Options

**Badger** (Default - Fastest):
```bash
DB_ENGINE=badger
DB_PATH=/app/db/
```

**PostgreSQL** (Production):
```bash
DB_ENGINE=postgres
DATABASE_URL=postgres://user:pass@host:5432/dbname
```

**LMDB** (Alternative):
```bash
DB_ENGINE=lmdb
DB_PATH=/app/db/
```

---

## Production Deployment

### Using systemd (Linux)

**Create relay service:**
```bash
sudo nano /etc/systemd/system/nostr-cms.service
```

```ini
[Unit]
Description=Nostr CMS with Swarm Relay
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/nostr-cms
Environment="SERVE_FRONTEND=true"
Environment="VITE_DEFAULT_RELAY=ws://yourdomain.com"
Environment="VITE_MASTER_PUBKEY=your_pubkey"
ExecStart=/opt/nostr-cms/swarm/swarm
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

**Enable and start:**
```bash
sudo systemctl daemon-reload
sudo systemctl enable nostr-cms
sudo systemctl start nostr-cms
sudo systemctl status nostr-cms
```

### Using Nginx Reverse Proxy

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3334;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### SSL with Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

---

## Troubleshooting

### Frontend Not Loading

**Check if frontend is enabled:**
```bash
cd swarm
export SERVE_FRONTEND=true
go run main.go
```

**Check frontend path:**
```bash
ls -la ../dist/  # Should contain index.html
```

**Check logs:**
```bash
docker compose -f docker-compose.combined.yml logs relay
```

### WebSocket Connection Failed

**Verify VITE_DEFAULT_RELAY:**
- Must use `ws://` or `wss://` protocol
- Must match relay port (default: 3334)

**Check relay is running:**
```bash
curl http://localhost:3334
```

### Blossom Uploads Not Working

**Verify Blossom is enabled:**
```bash
BLOSSOM_ENABLED=true
BLOSSOM_PATH=blossom/
```

**Check directory permissions:**
```bash
ls -la blossom/
```

### Database Errors

**Badger:**
```bash
# Clear and restart
rm -rf db/
go run main.go
```

**PostgreSQL:**
```bash
# Check connection
psql $DATABASE_URL
```

### Port Already in Use

**Find process using port 3334:**
```bash
lsof -i :3334
```

**Kill process:**
```bash
kill -9 <PID>
```

### Build Errors

**Clear node_modules:**
```bash
rm -rf node_modules package-lock.json
npm install
```

**Rebuild frontend:**
```bash
npm run build:embedded
```

---

## Performance Tuning

### Go Relay

**Increase file descriptors:**
```bash
ulimit -n 65536
```

**Enable GOMAXPROCS:**
```bash
export GOMAXPROCS=$(nproc)
```

### Frontend

**Enable compression:**
```nginx
gzip on;
gzip_types text/plain text/css application/json application/javascript;
```

**Cache static assets:**
```nginx
location ~* \.(js|css|png|jpg|jpeg|gif|ico)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

---

## Monitoring

### Health Checks

**Relay health:**
```bash
curl http://localhost:3334
```

**Blossom health:**
```bash
curl http://localhost:3334/list/YOUR_PUBKEY
```

### Logs

**Docker logs:**
```bash
docker compose -f docker-compose.combined.yml logs -f relay
```

**Systemd logs:**
```bash
journalctl -u nostr-cms -f
```

---

## Backup & Restore

### Backup Database

```bash
# Badger
tar -czf backup-$(date +%Y%m%d).tar.gz db/

# PostgreSQL
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql
```

### Backup Blossom Files

```bash
tar -czf blossom-backup-$(date +%Y%m%d).tar.gz blossom/
```

### Restore

```bash
# Extract backup
tar -xzf backup-YYYYMMDD.tar.gz

# Restart relay
systemctl restart nostr-cms
```

---

## Support

- **GitHub Issues**: Report bugs and feature requests
- **Documentation**: See `/docs` directory for detailed guides
- **Nostr NIPs**: Refer to [NIP Repository](https://github.com/nostr-protocol/nips)
