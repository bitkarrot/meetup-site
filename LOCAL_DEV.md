# Local Development Guide

Quick guide for running Nostr-CMS + Swarm Relay locally without Docker.

## Quick Reference

| Mode | Command | Frontend URL | Relay URL |
|------|---------|--------------|-----------|
| **Separated** (Recommended for dev) | `npm run dev` + `cd swarm && go run main.go` | http://localhost:8080 | ws://localhost:3334 |
| **Combined** | `npm run build:embedded` + `cd swarm && go run main.go` | http://localhost:3334 | ws://localhost:3334 |

---

## Option 1: Separated Mode (Recommended for Development)

Best for active frontend development with hot reload.

### Prerequisites
- Node.js 18+
- Go 1.23+

### Setup

**1. Install Dependencies**
```bash
npm install
```

**2. Configure Frontend (.env)**
```bash
cp .env.example .env
nano .env
```

Required variables:
```bash
VITE_DEFAULT_RELAY=ws://localhost:3334
VITE_REMOTE_NOSTR_JSON_URL=
VITE_MASTER_PUBKEY=your_pubkey_here
```

**3. Configure Relay (swarm/.env)**
```bash
cd swarm
cp .env.example .env
nano .env
```

Required variables:
```bash
RELAY_PUBKEY=your_pubkey_here
```

### Run

**Terminal 1: Start Relay**
```bash
cd swarm
go run main.go
```

Output:
```
running on :3334 with extended timeouts for large uploads
```

**Terminal 2: Start Frontend**
```bash
npm run dev
```

Output:
```
  ➜  Local:   http://localhost:8080/
  ➜  Network: use --host to expose
```

### Access
- Frontend: http://localhost:8080
- Relay: ws://localhost:3334
- Relay Dashboard: http://localhost:3334/dashboard

---

## Option 2: Combined Mode (Production-Like)

Best for testing the combined deployment locally.

### Setup

**1. Build Frontend**
```bash
npm run build:embedded
```

Output:
```
Building Nostr-CMS for embedded deployment...
Frontend built successfully for embedding!
Output: dist/
```

**2. Configure Relay (swarm/.env)**
```bash
cd swarm
cat > .env << EOF
RELAY_NAME="Local Nostr CMS"
RELAY_PUBKEY=your_pubkey_here
RELAY_DESCRIPTION="Local Development"
RELAY_PORT=3334

# Enable Frontend
SERVE_FRONTEND=true
FRONTEND_BASE_PATH=/
ENABLE_FRONTEND_AUTH=false
NOSTR_JSON_MODE=local

# Frontend Config
VITE_DEFAULT_RELAY=ws://localhost:3334
VITE_REMOTE_NOSTR_JSON_URL=
VITE_MASTER_PUBKEY=your_pubkey_here

# Database
DB_ENGINE=badger
DB_PATH=./db/

# Blossom
BLOSSOM_ENABLED=true
BLOSSOM_PATH=blossom/
BLOSSOM_URL=http://localhost:3334
EOF
```

### Run

**With Embedded Frontend (Static Build):**
```bash
cd swarm
go run main.go
```

**With Live Frontend (Hot Reload):**
```bash
# Terminal 1: Watch and rebuild frontend
npm run build -- --watch

# Terminal 2: Run relay with local filesystem
cd swarm
export SERVE_FRONTEND=true
export FRONTEND_PATH=../dist
go run main.go
```

### Access
- Combined Site: http://localhost:3334
- Relay Dashboard: http://localhost:3334/dashboard
- Blossom Upload: http://localhost:3334/upload

---

## Development Workflow

### Making Frontend Changes

**Separated Mode (Hot Reload):**
1. Edit files in `src/`
2. Browser auto-refreshes
3. No rebuild needed

**Combined Mode:**
1. Edit files in `src/`
2. Rebuild: `npm run build`
3. Refresh browser (or use `--watch` mode)

### Making Relay Changes

1. Edit files in `swarm/`
2. Restart relay: `cd swarm && go run main.go`

### Testing Both Modes

```bash
# Test separated mode first (hot reload)
npm run dev  # Terminal 1
cd swarm && go run main.go  # Terminal 2

# Then test combined mode
npm run build:embedded
cd swarm
export SERVE_FRONTEND=true
go run main.go
```

---

## Common Issues

### Port 3334 Already in Use

**Find and kill process:**
```bash
lsof -i :3334
kill -9 <PID>
```

### Port 8080 Already in Use

**Find and kill process:**
```bash
lsof -i :8080
kill -9 <PID>
```

### Frontend Can't Connect to Relay

**Check relay is running:**
```bash
curl http://localhost:3334
```

**Check VITE_DEFAULT_RELAY in .env:**
```bash
# Must be ws:// not http://
VITE_DEFAULT_RELAY=ws://localhost:3334
```

### Build Errors

**Clear cache and reinstall:**
```bash
rm -rf node_modules package-lock.json dist
npm install
npm run build:embedded
```

### Go Build Errors

**Install Go dependencies:**
```bash
cd swarm
go mod download
go mod tidy
```

---

## Useful Commands

### Frontend
```bash
npm run dev          # Start dev server (port 8080)
npm run build        # Build for production
npm run build:embedded  # Build for embedding in Go binary
npm run test         # Run tests
```

### Relay
```bash
cd swarm
go run main.go       # Start relay (port 3334)
go build             # Build binary
./swarm              # Run built binary
```

### Database
```bash
# Badger (default)
ls -la db/           # Check database files
rm -rf db/           # Reset database

# PostgreSQL (if configured)
psql $DATABASE_URL   # Connect to database
```

### Logs
```bash
# Relay logs
cd swarm
go run main.go 2>&1 | tee relay.log

# Frontend logs
npm run dev 2>&1 | tee frontend.log
```

---

## Testing

### Test Relay Connection
```bash
# Websocket connection
wscat -c ws://localhost:3334

# HTTP endpoint
curl http://localhost:3334
```

### Test Blossom Upload
```bash
# Upload test file
curl -X PUT http://localhost:3334/upload \
  -H "Authorization: Nostr <base64-event>" \
  --data-binary @test.jpg
```

### Test Frontend Build
```bash
npm run build:embedded
ls -la dist/  # Should contain index.html, assets, etc.
```

---

## IDE Setup

### VS Code

**Recommended Extensions:**
- ESLint
- Prettier
- Tailwind CSS IntelliSense
- Go (golang.go)

**Settings:**
```json
{
  "typescript.tsdk": "node_modules/typescript/lib",
  "tailwindCSS.includeLanguages": {
    "typescript": "javascript",
    "typescriptreact": "html"
  }
}
```

---

## Next Steps

1. **Read Deployment Guide**: See [DEPLOYMENT.md](./DEPLOYMENT.md) for production deployment
2. **Read Admin Docs**: See [docs/](./docs/) for feature documentation
3. **Configure Nostr.json**: Set up your admin authentication
4. **Customize**: Edit site settings through the admin dashboard

---

## Tips

- Use separated mode for active frontend development (hot reload)
- Use combined mode to test before production deployment
- Keep relay running while developing frontend (separated mode)
- Use `FRONTEND_PATH=../dist` for rapid iteration in combined mode
- Check browser console for WebSocket connection issues
- Use relay dashboard to monitor activity: http://localhost:3334/dashboard
