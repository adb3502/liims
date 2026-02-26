# BHARAT Study LIMS -- Longevity India Laboratory Information Management System

A full-stack Laboratory Information Management System (LIMS) for the BHARAT Study (Biomarkers of Healthy Aging, Resilience, Adversity, and Transitions) -- a multi-omics aging research initiative tracking 5,000+ participants across 6 hospital sites in India.

## Architecture

| Service | Technology | Port |
|---------|-----------|------|
| Frontend | React 19 + Vite + TypeScript, served by Nginx | 80 (host) |
| API | FastAPI + Uvicorn (async) | 8000 (internal) |
| Celery Worker | Celery 5 with Redis broker | -- |
| Celery Beat | Periodic task scheduler | -- |
| Database | PostgreSQL 15 | 5432 (internal) |
| Cache/Broker | Redis 7 | 6379 (internal) |

All 6 services run as Docker containers on a single `liims` bridge network. Nginx reverse-proxies `/api/*` requests to FastAPI and serves the React SPA for all other routes.

## Features

- **Participant management** -- enrollment, consent tracking, age-group classification, ODK Central sync
- **Sample lifecycle** -- registration, processing, transport, storage, QC, discard workflow
- **Biobank storage** -- freezer/rack/box hierarchy, 9x9 and 10x10 box grids, QR code tracking
- **Field operations** -- collection events, bulk digitization, offline-capable data entry
- **Partner lab integration** -- Healthians, 1mg, Lalpath, DecodeAge import/export
- **Instruments** -- TECAN plate designer, instrument runs, proteomics/metabolomics pipeline, ICC workflow
- **Dashboards and reports** -- enrollment, inventory, quality, site-level analytics, data explorer, query builder
- **Label generation** -- A4 label sheets (python-docx), 22 labels per participant across 5 sample groups
- **File store** -- managed NAS watch directories, integrity verification, file categorization
- **Notifications** -- real-time alerts for freezer events, sync failures, backup health, consent withdrawals
- **PWA** -- service worker, IndexedDB offline store, background sync
- **Security** -- JWT auth with session revocation, RBAC (7 roles), rate limiting, security headers, account lockout

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine + Docker Compose v2+)
- Git
- 4 GB RAM minimum (8 GB recommended)
- 20 GB free disk space

## Quick Start

```bash
# 1. Clone the repository
git clone <repo-url> lims
cd lims

# 2. Create environment file
cp .env.example .env
# Edit .env -- at minimum set POSTGRES_PASSWORD and SECRET_KEY

# 3. Start all services
docker compose up -d

# 4. Run database migrations and seed
docker compose exec api alembic upgrade head
docker compose exec api python -m app.seed

# 5. Access the application
# Open http://localhost in your browser
```

**Default login:** `adb` / `Admin@123`

For a scripted deployment with migrations and optional seeding:

```bash
./scripts/deploy.sh --seed
```

## Development Setup

### Backend (FastAPI)

```bash
cd backend
pip install -e ".[dev]"

# Start with auto-reload (requires PostgreSQL and Redis running)
uvicorn app.main:app --reload --port 8000

# Database migrations
alembic upgrade head                         # Apply all migrations
alembic revision --autogenerate -m "desc"    # Generate new migration

# Linting and formatting
ruff check app/
ruff format app/
```

### Frontend (React 19)

```bash
cd frontend
npm install
npm run dev      # Dev server on http://localhost:3000
npm run build    # Production build to dist/
npm run lint     # ESLint
```

## Environment Variables

See `.env.example` for the full template. Key variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_PASSWORD` | -- | PostgreSQL password (required) |
| `SECRET_KEY` | -- | JWT signing key (required in production) |
| `DEBUG` | `false` | Enable debug mode, verbose SQL logging |
| `FRONTEND_PORT` | `80` | Host port for the frontend |
| `CORS_ORIGINS` | `["http://localhost"]` | JSON array of allowed CORS origins |
| `JWT_EXPIRY_HOURS` | `24` | JWT token lifetime |
| `BCRYPT_ROUNDS` | `12` | bcrypt cost factor |
| `ODK_CENTRAL_URL` | -- | ODK Central server URL |
| `SMTP_HOST` | -- | SMTP server for email alerts |
| `NAS_MOUNT_PATH` | `/mnt/nas` | Host path to NAS mount (read-only) |
| `FILE_STORE_MAX_SIZE_MB` | `100` | Max upload size per file |
| `DASHBOARD_REFRESH_INTERVAL_MINUTES` | `15` | Dashboard cache refresh interval |

## Project Structure

```
lims/
├── backend/
│   ├── alembic/                 # Database migrations
│   ├── app/
│   │   ├── api/v1/              # Route handlers (25 route files)
│   │   ├── core/                # Auth, security, middleware, rate limiting
│   │   ├── models/              # SQLAlchemy 2.0 models (13 domain files)
│   │   ├── schemas/             # Pydantic request/response schemas
│   │   ├── services/            # Business logic layer
│   │   ├── tasks/               # Celery background tasks
│   │   ├── main.py              # FastAPI app entry point
│   │   ├── config.py            # Pydantic Settings (env-based config)
│   │   ├── database.py          # Async SQLAlchemy engine/session
│   │   ├── celery_app.py        # Celery instance with beat schedule
│   │   └── seed.py              # Database seeding (reference data only)
│   ├── Dockerfile
│   └── pyproject.toml
├── frontend/
│   ├── src/
│   │   ├── api/                 # TanStack Query hooks (16 domain files)
│   │   ├── components/          # UI primitives + layout (Sidebar, Header)
│   │   ├── features/            # Domain modules (13 feature areas)
│   │   ├── lib/                 # Axios client, utils, offline, chart theme
│   │   ├── pages/               # Root pages (Dashboard, Login, 404, 403)
│   │   ├── stores/              # Zustand stores (auth, notifications)
│   │   ├── hooks/               # Custom React hooks
│   │   ├── types/               # TypeScript type definitions
│   │   ├── App.tsx              # Root component with providers
│   │   ├── main.tsx             # Entry point
│   │   └── router.tsx           # All route definitions with guards
│   ├── Dockerfile               # Multi-stage build (Node + Nginx)
│   └── nginx.conf               # SPA routing + API proxy (per-container)
├── nginx.conf                   # Top-level Nginx config (rate limiting, security headers)
├── docker-compose.yml           # Development compose
├── docker-compose.prod.yml      # Production overrides (resource limits, network segmentation)
├── scripts/
│   ├── deploy.sh                # Automated deployment with migrations
│   └── backup.sh                # Database backup with retention
├── .env.example                 # Environment variable template
└── docs/                        # Architecture and deployment documentation
```

## Scripts

| Script | Usage | Description |
|--------|-------|-------------|
| `scripts/deploy.sh` | `./scripts/deploy.sh [--prod] [--seed] [--no-build]` | Build, migrate, seed, start all services |
| `scripts/backup.sh` | `./scripts/backup.sh [--retain-days 30]` | Timestamped pg_dump with automatic pruning |

## Collection Sites

| Code | Hospital | Location | Status |
|------|----------|----------|--------|
| RMH | M.S. Ramaiah Memorial Hospital | Bengaluru | Active |
| BBH | Bangalore Baptist Hospital | Bengaluru | Active |
| SSSSMH | Sri Sathya Sai Sarla Memorial Hospital | Chikkaballapur | Active |
| CHAF | Command Hospital Air Force | Bengaluru | Active |
| BMC | Bangalore Medical College | Bengaluru | Not active |
| JSS | JSS Hospital | Mysuru | Not active |

## License

Proprietary -- Indian Institute of Science, Bengaluru.
