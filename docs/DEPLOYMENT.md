# BHARAT Study LIMS -- Deployment Guide

## Prerequisites

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| Docker Desktop (or Docker Engine) | v24+ | Latest |
| Docker Compose | v2.0+ | v2.20+ |
| RAM | 4 GB | 8 GB |
| Disk | 20 GB | 50 GB+ (depends on file store usage) |
| OS | Windows 10/11, Ubuntu 20.04+, macOS 12+ | -- |

## Environment Configuration

Copy the template and fill in secrets:

```bash
cp .env.example .env
```

### All Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `POSTGRES_PASSWORD` | Yes | -- | PostgreSQL password. Use a strong random value. |
| `SECRET_KEY` | Yes | -- | JWT signing key. Generate with: `python -c "import secrets; print(secrets.token_urlsafe(64))"` |
| `DEBUG` | No | `false` | Enable debug mode. Exposes stack traces in errors and verbose SQL logging. Never enable in production. |
| `FRONTEND_PORT` | No | `80` | Host port for the frontend. Change if port 80 is in use. |
| `CORS_ORIGINS` | No | `["http://localhost","http://localhost:80"]` | JSON array of allowed CORS origins. Add your machine's IP for LAN access. |
| `CORS_ALLOW_ALL` | No | `false` | Set to `true` to allow all origins (`*`). Useful for local-network deployments where the server IP changes. Do not enable in production. |
| `JWT_EXPIRY_HOURS` | No | `24` | JWT token lifetime in hours. |
| `BCRYPT_ROUNDS` | No | `12` | bcrypt hashing cost factor. Higher = slower but more secure. |
| `ODK_CENTRAL_URL` | No | -- | ODK Central server URL for form sync. |
| `ODK_CENTRAL_EMAIL` | No | -- | ODK Central admin email. |
| `ODK_CENTRAL_PASSWORD` | No | -- | ODK Central admin password. |
| `ODK_PROJECT_ID` | No | `1` | ODK project ID to sync from. |
| `ODK_FORM_ID` | No | `participant_id` | ODK form ID to sync. |
| `ODK_SYNC_INTERVAL_MINUTES` | No | `60` | How often to sync with ODK Central (minutes). |
| `SMTP_HOST` | No | -- | SMTP server for email notifications. |
| `SMTP_PORT` | No | `587` | SMTP port. |
| `SMTP_USER` | No | -- | SMTP username. |
| `SMTP_PASSWORD` | No | -- | SMTP password. |
| `SMTP_FROM_NAME` | No | `LIIMS Alerts` | Display name for notification emails. |
| `SMTP_USE_TLS` | No | `true` | Use TLS for SMTP. |
| `REDIS_URL` | No | `redis://redis:6379` | Redis connection URL. Change only for external Redis. |
| `NAS_MOUNT_PATH` | No | `/mnt/nas` | Host path to NAS mount for instrument output files. Mounted read-only. |
| `FILE_STORE_MAX_SIZE_MB` | No | `100` | Maximum file upload size in megabytes. |
| `DASHBOARD_REFRESH_INTERVAL_MINUTES` | No | `15` | Dashboard cache refresh interval. |

## Production Deployment

### Step-by-Step

```bash
# 1. Configure environment
cp .env.example .env
# Edit .env with production values:
#   - Strong POSTGRES_PASSWORD
#   - Strong SECRET_KEY (python -c "import secrets; print(secrets.token_urlsafe(64))")
#   - DEBUG=false
#   - CORS_ORIGINS with your domain/IP

# 2. Deploy with production overrides
./scripts/deploy.sh --prod --seed

# Or manually:
docker compose -f docker-compose.yml -f docker-compose.prod.yml build --parallel
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d postgres redis
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm api alembic upgrade head
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm api python -m app.seed
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

The production compose overlay (`docker-compose.prod.yml`) adds:

- Gunicorn with 4 Uvicorn workers (instead of single-process Uvicorn)
- CPU and memory resource limits on all containers
- Internal-only backend network (PostgreSQL and Redis are not reachable from the host)
- Log rotation with size limits
- PostgreSQL performance tuning
- Redis persistence with RDB snapshots

### Verify Deployment

```bash
# Check all services are running
docker compose ps

# Check health endpoint
curl http://localhost/api/health

# View logs
docker compose logs -f api
docker compose logs -f celery-worker
```

## Local Network Deployment

This is the primary deployment model -- a single machine on the hospital/lab LAN serving all clients on the local network.

### 1. Find the machine's IP address

**Windows:**
```powershell
ipconfig
# Look for "IPv4 Address" under your active adapter, e.g. 192.168.1.100
```

**Linux:**
```bash
ip addr show | grep "inet " | grep -v 127.0.0.1
# e.g. 192.168.1.100
```

**macOS:**
```bash
ifconfig | grep "inet " | grep -v 127.0.0.1
```

### 2. Configure CORS for LAN access

Edit `.env`:

```env
CORS_ORIGINS=["http://localhost","http://192.168.1.100"]
```

Replace `192.168.1.100` with your actual IP.

### 3. Open the firewall

**Windows:**
```powershell
netsh advfirewall firewall add rule name="LIIMS HTTP" dir=in action=allow protocol=TCP localport=80
```

To remove the rule later:
```powershell
netsh advfirewall firewall delete rule name="LIIMS HTTP"
```

**Linux (ufw):**
```bash
sudo ufw allow 80/tcp
```

### 4. Start services

```bash
docker compose up -d
```

### 5. Access from any device on the network

Open a browser on any computer, tablet, or phone connected to the same network:

```
http://192.168.1.100/
```

### 6. Install as PWA

On a mobile device or tablet:

1. Open `http://<machine-ip>/` in Chrome
2. Tap the browser menu (three dots)
3. Select "Add to Home Screen" or "Install app"
4. The app will appear as a standalone icon on the home screen

Note: PWA features like background sync require either `localhost` or HTTPS. For LAN access over plain HTTP, the service worker will register but some features may be limited.

## SSL Setup (Optional)

Required for full PWA support on non-localhost origins and for production internet-facing deployments.

### 1. Obtain certificates

Place your certificate files in the `ssl/` directory:

```
ssl/
├── fullchain.pem    # Certificate chain
└── privkey.pem      # Private key
```

For self-signed certificates (LAN only):

```bash
mkdir -p ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout ssl/privkey.pem \
  -out ssl/fullchain.pem \
  -subj "/CN=liims.local"
```

### 2. Enable SSL in Nginx

Edit `nginx.conf` -- uncomment the SSL-related lines:

- `listen 443 ssl http2;`
- `ssl_certificate`, `ssl_certificate_key`
- `ssl_protocols`, `ssl_ciphers`
- `Strict-Transport-Security` header
- HTTP-to-HTTPS redirect server block

### 3. Deploy with production compose

The production compose file maps port 443 and mounts the `ssl/` directory:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### 4. Update CORS

```env
CORS_ORIGINS=["https://192.168.1.100","https://liims.local"]
```

## Database Backup

### Create a backup

```bash
./scripts/backup.sh
```

This creates a timestamped gzipped SQL dump in the `backups/` directory:

```
backups/liims_20260226_143000.sql.gz
```

### Customize retention

```bash
./scripts/backup.sh --retain-days 60    # Keep 60 days of backups
```

### Manual backup

```bash
docker compose exec -T postgres \
  pg_dump -U liims -d liims --no-owner --no-privileges \
  | gzip > backup_$(date +%Y%m%d).sql.gz
```

### Restore from backup

```bash
# Stop the API and workers first
docker compose stop api celery-worker celery-beat

# Restore
gunzip < backups/liims_20260226_143000.sql.gz \
  | docker compose exec -T postgres psql -U liims -d liims

# Restart services
docker compose up -d
```

### Automated backups

Add a cron job (Linux) or Task Scheduler entry (Windows):

```bash
# Linux: Daily backup at 2 AM
0 2 * * * /path/to/lims/scripts/backup.sh >> /var/log/liims-backup.log 2>&1
```

## Auto-Start on System Restart

All Docker services are configured with `restart: unless-stopped`, so they restart automatically whenever Docker Desktop is running. Two steps are required after a fresh install.

### Step 1 — Enable Docker Desktop auto-start

Open Docker Desktop → Settings (gear icon) → General → enable **"Start Docker Desktop when you log in"**.

### Step 2 — Install the LIIMS startup script (one-time)

```powershell
cd D:\Users\adb\dev\bharat-study\lims
powershell -ExecutionPolicy Bypass -File scripts\install-startup.ps1
```

This places a shortcut in the Windows Startup folder. On every login it:

1. Waits up to 3 minutes for Docker Engine to become ready
2. Runs `docker compose up -d`
3. Logs output to `logs\startup.log`

To uninstall, delete `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\LIIMS.lnk`.

### Verify after reboot

```bash
docker compose ps
curl http://localhost/api/health
```

---

## Updating

```bash
# Pull latest code
git pull

# Rebuild and restart (migrations run automatically if using deploy.sh)
./scripts/deploy.sh --no-build    # Skip rebuild if only config changed
./scripts/deploy.sh               # Full rebuild

# Or manually:
docker compose up -d --build
docker compose exec api alembic upgrade head
```

## Monitoring

### Health Check

The `/api/health` endpoint verifies database and Redis connectivity:

```bash
curl -s http://localhost/api/health | python -m json.tool
```

Response when healthy:
```json
{
  "version": "0.1.0",
  "database": { "status": "ok", "latency_ms": 2.1 },
  "redis": { "status": "ok", "latency_ms": 0.8 },
  "celery_broker": "ok",
  "status": "healthy"
}
```

Response when degraded (HTTP 503):
```json
{
  "version": "0.1.0",
  "database": { "status": "error", "detail": "connection refused" },
  "redis": { "status": "ok", "latency_ms": 0.8 },
  "celery_broker": "ok",
  "status": "degraded"
}
```

### Service Status

```bash
docker compose ps                   # Service status and ports
docker stats                        # Live CPU/memory usage
docker compose logs -f api          # Follow API logs
docker compose logs -f celery-worker  # Follow worker logs
docker compose logs --tail=100 postgres  # Last 100 lines of DB logs
```

### Celery Monitoring

```bash
# Check active tasks
docker compose exec celery-worker celery -A app.celery_app:celery inspect active

# Check scheduled tasks
docker compose exec celery-worker celery -A app.celery_app:celery inspect scheduled

# Check registered tasks
docker compose exec celery-worker celery -A app.celery_app:celery inspect registered
```

## Troubleshooting

### Port 80 already in use

```bash
# Find what is using port 80
# Windows:
netstat -ano | findstr :80
# Linux:
sudo lsof -i :80

# Option 1: Stop the conflicting service
# Option 2: Change the port in .env:
FRONTEND_PORT=8080
```

### Database connection refused

```bash
# Check if postgres is running
docker compose ps postgres

# Check postgres logs
docker compose logs postgres

# Verify the container is healthy
docker compose exec postgres pg_isready -U liims -d liims
```

### API returns 503 (unhealthy)

```bash
# Check the health endpoint details
curl -s http://localhost/api/health

# Check API logs for errors
docker compose logs --tail=50 api

# Restart the API
docker compose restart api
```

### Frontend shows blank page

```bash
# Check if frontend container is running
docker compose ps frontend

# Verify the build assets exist
docker compose exec frontend ls /usr/share/nginx/html/assets/

# Check frontend Nginx logs
docker compose logs frontend
```

### Celery tasks not running

```bash
# Check worker status
docker compose ps celery-worker celery-beat

# Check worker logs
docker compose logs celery-worker

# Verify Redis is reachable
docker compose exec redis redis-cli ping
```

### Migrations fail

```bash
# Check current migration state
docker compose exec api alembic current

# View migration history
docker compose exec api alembic history

# Check for pending migrations
docker compose exec api alembic heads
```

### SECRET_KEY error on startup

The API refuses to start with the default `SECRET_KEY` when `DEBUG=false`:

```
RuntimeError: SECRET_KEY is still the default value.
```

Generate a proper key:

```bash
python -c "import secrets; print(secrets.token_urlsafe(64))"
```

Set it in `.env` and restart:

```bash
docker compose restart api
```

### Docker build cache issues

BuildKit caches aggressively even with `--no-cache`. A truly fresh rebuild requires removing the image and build cache:

```bash
docker compose down
docker rmi $(docker compose config --images)
docker builder prune -af
docker compose up -d --build
```

To verify the correct bundle is deployed (Vite minifies variable names, so check for static strings):

```bash
docker compose exec frontend ls /usr/share/nginx/html/assets/index-*.js
```

### Windows-specific: line ending issues

If shell scripts fail with `\r` errors:

```bash
git config core.autocrlf input
git checkout -- scripts/
```
