# LIIMS Deployment and Operations Guide

This guide covers deploying, configuring, monitoring, backing up, and troubleshooting the LIIMS platform.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Environment Configuration](#2-environment-configuration)
3. [Deployment (Development)](#3-deployment-development)
4. [Deployment (Production)](#4-deployment-production)
5. [Database Initialization](#5-database-initialization)
6. [Backup and Restore](#6-backup-and-restore)
7. [Monitoring](#7-monitoring)
8. [Scaling](#8-scaling)
9. [SSL/TLS Setup](#9-ssltls-setup)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Prerequisites

| Requirement | Minimum Version | Notes |
|-------------|----------------|-------|
| Docker | 24.0+ | Docker Engine or Docker Desktop |
| Docker Compose | 2.20+ | V2 (plugin), not standalone V1 |
| Git | 2.30+ | For cloning the repository |
| Disk Space | 10 GB+ | For images, database, and backups |
| RAM | 4 GB+ | 8 GB recommended for production |

Optional (for local development without Docker):

| Requirement | Version |
|-------------|---------|
| Python | 3.11+ |
| Node.js | 18+ |
| PostgreSQL | 15+ |
| Redis | 7+ |

---

## 2. Environment Configuration

### Creating the .env File

Copy the example and configure:

```bash
cp .env.example .env
```

### Required Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_PASSWORD` | password | PostgreSQL password (change in production) |
| `SECRET_KEY` | change-me-in-production | JWT signing key (must change for production) |

### Application Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `DEBUG` | false | Enable debug mode (never true in production) |
| `FRONTEND_PORT` | 80 | Port for the frontend/nginx |
| `CORS_ORIGINS` | ["http://localhost","http://localhost:80"] | Allowed CORS origins (JSON array) |
| `JWT_EXPIRY_HOURS` | 24 | JWT token lifetime in hours |
| `BCRYPT_ROUNDS` | 12 | Password hashing cost factor |

### Database

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | postgresql+asyncpg://liims:password@postgres:5432/liims | Primary database URL |
| `REPLICA_DATABASE_URL` | (empty) | Read replica URL (optional) |

### Redis

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_URL` | redis://redis:6379 | Redis connection URL |
| `CELERY_BROKER_URL` | redis://redis:6379/0 | Celery broker (Redis db 0) |
| `CELERY_RESULT_BACKEND` | redis://redis:6379/1 | Celery results (Redis db 1) |

### ODK Central Integration

| Variable | Default | Description |
|----------|---------|-------------|
| `ODK_CENTRAL_URL` | (empty) | ODK Central server URL |
| `ODK_CENTRAL_EMAIL` | (empty) | ODK Central service account email |
| `ODK_CENTRAL_PASSWORD` | (empty) | ODK Central service account password |
| `ODK_SYNC_INTERVAL_MINUTES` | 60 | Auto-sync interval |

### Email / SMTP

| Variable | Default | Description |
|----------|---------|-------------|
| `SMTP_HOST` | (empty) | SMTP server hostname |
| `SMTP_PORT` | 587 | SMTP port |
| `SMTP_USER` | (empty) | SMTP username |
| `SMTP_PASSWORD` | (empty) | SMTP password |
| `SMTP_FROM_NAME` | LIIMS Alerts | Sender display name |
| `SMTP_USE_TLS` | true | Enable STARTTLS |

### File Storage

| Variable | Default | Description |
|----------|---------|-------------|
| `NAS_MOUNT_PATH` | ./data/nas | Host path to NAS mount (mounted read-only in containers) |
| `FILE_STORE_PATH` | /data/file_store | Internal file store path |
| `FILE_STORE_MAX_SIZE_MB` | 100 | Max file size for managed files |

### Dashboard

| Variable | Default | Description |
|----------|---------|-------------|
| `DASHBOARD_REFRESH_INTERVAL_MINUTES` | 15 | Dashboard cache refresh interval |

---

## 3. Deployment (Development)

### Quick Start

```bash
# Clone the repository
git clone <repo-url>
cd lims

# Create environment file
cp .env.example .env
# Edit .env to set at minimum: POSTGRES_PASSWORD, SECRET_KEY

# Start all services
docker compose up -d

# Check service health
docker compose ps
docker compose logs -f api
```

### Using the Deploy Script

```bash
# Development deployment with database seed
./scripts/deploy.sh --seed

# Flags:
#   --seed      Run database seed after migration
#   --no-build  Skip image rebuild
```

### Accessing the Application

| Service | URL |
|---------|-----|
| Frontend (UI) | http://localhost:80 |
| API Docs (Swagger) | http://localhost:80/api/docs |
| OpenAPI Schema | http://localhost:80/api/openapi.json |
| Health Check | http://localhost:80/api/health |

### Local Development (Without Docker)

Backend:

```bash
cd backend
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev  # Dev server on port 3000
```

---

## 4. Deployment (Production)

### Using Production Overrides

```bash
# Deploy with production optimizations
./scripts/deploy.sh --prod

# Or manually:
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Production Differences

| Aspect | Development | Production |
|--------|-------------|------------|
| API server | uvicorn (1 worker, auto-reload) | gunicorn + 4 uvicorn workers |
| PostgreSQL | Default config | Tuned (shared_buffers=256MB, work_mem=8MB, etc.) |
| Redis | maxmemory 256MB | maxmemory 512MB, RDB snapshots |
| Logging | stdout | JSON files with rotation (max 10-20MB, 3-10 files) |
| Networks | Single network | Separate frontend/backend (backend is internal) |
| Resources | No limits | CPU and memory limits on all containers |
| Celery | Debug logging | Warning level, max-tasks-per-child=1000 |
| SSL | Disabled | Ready (uncomment nginx config) |
| DEBUG | true/false | Must be false |
| SECRET_KEY | Any value | Must not be default (enforced at startup) |

### Production Checklist

1. Set a strong, unique `SECRET_KEY` (generate with `openssl rand -hex 32`)
2. Set a strong `POSTGRES_PASSWORD`
3. Set `DEBUG=false`
4. Configure `CORS_ORIGINS` to your actual domain
5. Set up SSL certificates (see [SSL/TLS Setup](#9-ssltls-setup))
6. Configure SMTP for email notifications
7. Configure ODK Central credentials if using ODK integration
8. Mount NAS storage at the configured path
9. Set up automated backups (cron + `scripts/backup.sh`)
10. Set up log rotation and monitoring

---

## 5. Database Initialization

### Alembic Migrations

The deploy script runs migrations automatically. To run manually:

```bash
# Run pending migrations
docker compose exec api alembic upgrade head

# Check current migration version
docker compose exec api alembic current

# Generate new migration after model changes
docker compose exec api alembic revision --autogenerate -m "description"

# Rollback one migration
docker compose exec api alembic downgrade -1
```

### Database Seeding

The seed script creates initial data (super admin user, collection sites, system settings):

```bash
# Via deploy script
./scripts/deploy.sh --seed

# Or directly
docker compose exec api python -m app.seed
```

### pg_trgm Extension

The `pg_trgm` extension is required for fuzzy search. It should be created by the migration scripts:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

If needed manually:

```bash
docker compose exec postgres psql -U liims -d liims -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"
```

### Creating Tables Without Alembic

In development, you can also create all tables directly from the ORM:

```python
# Inside a Python shell in the api container
from app.database import engine, Base
from app.models import *  # Import all models
import asyncio

async def create_all():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

asyncio.run(create_all())
```

---

## 6. Backup and Restore

### Automated Backup

Use the provided backup script:

```bash
# Create backup (gzipped SQL dump)
./scripts/backup.sh

# With custom retention
./scripts/backup.sh --retain-days 60
```

This creates timestamped files in the `backups/` directory:

```
backups/
  liims_20250115_083000.sql.gz
  liims_20250116_083000.sql.gz
  ...
```

Old backups beyond the retention period are automatically pruned.

### Manual Backup

```bash
# Full database dump (gzipped)
docker compose exec -T postgres \
  pg_dump -U liims -d liims --no-owner --no-privileges --format=plain \
  | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz

# Custom format (allows selective restore)
docker compose exec -T postgres \
  pg_dump -U liims -d liims --format=custom \
  > backup_$(date +%Y%m%d).dump
```

### Restore from Backup

```bash
# Restore from gzipped SQL dump
gunzip -c backup_20250115.sql.gz | \
  docker compose exec -T postgres psql -U liims -d liims

# Restore from custom format
docker compose exec -T postgres \
  pg_restore -U liims -d liims --no-owner --clean backup_20250115.dump
```

### Scheduled Backups (cron)

Add to crontab for daily backups at 3 AM:

```cron
0 3 * * * /path/to/lims/scripts/backup.sh >> /var/log/liims-backup.log 2>&1
```

### Redis Backup

Redis is configured with AOF persistence. Snapshots are saved at:
- Every 900s if at least 1 key changed
- Every 300s if at least 10 keys changed
- Every 60s if at least 10000 keys changed

Redis data volume: `redis_data`

### Volume Backup

For full disaster recovery, also back up Docker volumes:

```bash
# Backup PostgreSQL data volume
docker run --rm -v lims_postgres_data:/data -v $(pwd)/backups:/backup \
  alpine tar czf /backup/postgres_volume_$(date +%Y%m%d).tar.gz -C /data .

# Backup file store volume
docker run --rm -v lims_file_store:/data -v $(pwd)/backups:/backup \
  alpine tar czf /backup/file_store_$(date +%Y%m%d).tar.gz -C /data .
```

---

## 7. Monitoring

### Health Check Endpoint

```bash
# Check overall system health
curl http://localhost/api/health
```

Response:

```json
{
  "version": "0.1.0",
  "status": "healthy",
  "database": { "status": "ok", "latency_ms": 2.5 },
  "redis": { "status": "ok", "latency_ms": 1.1 },
  "celery_broker": "ok"
}
```

HTTP 200 = healthy, HTTP 503 = degraded.

The API container has a Docker health check that polls `/api/health` every 10 seconds.

### Container Status

```bash
# Show all services
docker compose ps

# Service health
docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
```

### Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f api
docker compose logs -f celery-worker
docker compose logs -f postgres

# Last 100 lines
docker compose logs --tail=100 api

# Since timestamp
docker compose logs --since="2025-01-15T08:00:00" api
```

### Database Monitoring

```bash
# Connect to PostgreSQL
docker compose exec postgres psql -U liims -d liims

# Check active connections
SELECT count(*) FROM pg_stat_activity WHERE datname = 'liims';

# Check table sizes
SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 10;

# Check slow queries (production, log_min_duration_statement=1000ms)
docker compose logs postgres | grep "duration:"
```

### Redis Monitoring

```bash
# Connect to Redis
docker compose exec redis redis-cli

# Check memory usage
INFO memory

# Check connected clients
INFO clients

# Monitor commands in real-time
MONITOR
```

### Celery Monitoring

```bash
# Check registered tasks
docker compose exec celery-worker celery -A app.celery_app:celery inspect registered

# Check active tasks
docker compose exec celery-worker celery -A app.celery_app:celery inspect active

# Check scheduled tasks
docker compose exec celery-worker celery -A app.celery_app:celery inspect scheduled
```

### System Notifications

LIIMS automatically generates notifications for:
- ODK sync failures
- Freezer capacity warnings (approaching full)
- Freezer temperature excursions
- Backup staleness (no recent backup detected)
- File integrity failures (SHA-256 mismatch)
- Processing timer exceeded
- Import errors

These appear in the notification center and can be emailed via SMTP.

---

## 8. Scaling

### Horizontal Scaling

- **API:** Increase gunicorn workers (`--workers N`) or run multiple API containers behind nginx upstream.
- **Celery workers:** Scale with `docker compose up -d --scale celery-worker=3`.
- **PostgreSQL:** Add a read replica and configure `REPLICA_DATABASE_URL` for read-heavy queries.

### Vertical Scaling

Adjust resource limits in `docker-compose.prod.yml`:

```yaml
deploy:
  resources:
    limits:
      cpus: "4.0"
      memory: 2G
```

### PostgreSQL Connection Pool

The SQLAlchemy engine is configured with:
- `pool_size=20` (default concurrent connections)
- `max_overflow=10` (burst connections)
- `pool_pre_ping=True` (connection health check)

For high-load scenarios, consider using PgBouncer as a connection pooler.

---

## 9. SSL/TLS Setup

### Certificate Setup

Place certificates in the `ssl/` directory:

```
ssl/
  fullchain.pem    # Full certificate chain
  privkey.pem      # Private key
```

### Nginx Configuration

Uncomment the SSL sections in `nginx.conf`:

```nginx
server {
    listen 443 ssl http2;
    ssl_certificate     /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    # ...
}

# HTTP -> HTTPS redirect
server {
    listen 80;
    return 301 https://$host$request_uri;
}
```

### Let's Encrypt (Certbot)

```bash
# Install certbot
apt install certbot

# Obtain certificate
certbot certonly --standalone -d your-domain.com

# Copy to ssl directory
cp /etc/letsencrypt/live/your-domain.com/fullchain.pem ssl/
cp /etc/letsencrypt/live/your-domain.com/privkey.pem ssl/

# Set up auto-renewal (cron)
0 0 1 * * certbot renew && docker compose restart frontend
```

---

## 10. Troubleshooting

### Common Issues

#### API fails to start: "SECRET_KEY is still the default value"

**Cause:** Production mode requires a custom SECRET_KEY.

**Fix:** Set a strong SECRET_KEY in your `.env` file:

```bash
echo "SECRET_KEY=$(openssl rand -hex 32)" >> .env
```

#### Database connection refused

**Cause:** PostgreSQL container not ready yet.

**Fix:** Wait for the health check to pass, or check PostgreSQL logs:

```bash
docker compose logs postgres
docker compose exec postgres pg_isready -U liims -d liims
```

#### Alembic migration errors

**Cause:** Migration state mismatch.

**Fix:**

```bash
# Check current state
docker compose exec api alembic current

# Show migration history
docker compose exec api alembic history

# Stamp to a known state (if needed)
docker compose exec api alembic stamp head
```

#### Redis connection refused

**Cause:** Redis container not healthy.

**Fix:**

```bash
docker compose logs redis
docker compose exec redis redis-cli ping
```

#### Celery tasks not executing

**Cause:** Worker or beat container is down, or Redis broker unreachable.

**Fix:**

```bash
# Check worker status
docker compose logs celery-worker
docker compose logs celery-beat

# Restart workers
docker compose restart celery-worker celery-beat

# Verify broker connectivity
docker compose exec celery-worker celery -A app.celery_app:celery inspect ping
```

#### Frontend shows blank page or 502

**Cause:** API container is unhealthy, or frontend build failed.

**Fix:**

```bash
# Check API health
curl http://localhost:8000/api/health

# Check frontend nginx logs
docker compose logs frontend

# Rebuild frontend
docker compose build frontend
docker compose up -d frontend
```

#### "Account temporarily locked" on login

**Cause:** Too many failed login attempts.

**Fix:** Wait 15 minutes, or restart the API container to clear the in-memory lockout counter:

```bash
docker compose restart api
```

#### File scanning not finding files

**Cause:** NAS mount not accessible, or watch directory path incorrect.

**Fix:**

```bash
# Check mount
docker compose exec api ls -la /data/nas

# Check watch directory configuration in the UI (Admin -> File Manager)
# Trigger manual scan via API
curl -X POST http://localhost/api/v1/files/watch-dirs/{id}/scan \
  -H "Authorization: Bearer <token>"
```

#### Dashboard showing stale data

**Cause:** Celery beat task not running.

**Fix:**

```bash
# Check celery-beat is running
docker compose ps celery-beat

# Check last dashboard cache update
docker compose exec postgres psql -U liims -d liims \
  -c "SELECT dashboard_type, computed_at FROM dashboard_cache ORDER BY computed_at DESC;"

# Restart beat
docker compose restart celery-beat
```

### Useful Diagnostic Commands

```bash
# Full system status
docker compose ps
curl -s http://localhost/api/health | python -m json.tool

# Database size
docker compose exec postgres psql -U liims -d liims \
  -c "SELECT pg_size_pretty(pg_database_size('liims'));"

# Container resource usage
docker stats --no-stream

# Disk usage of volumes
docker system df -v

# Rebuild everything from scratch
docker compose down -v  # WARNING: destroys all data
docker compose build --no-cache
docker compose up -d
```
