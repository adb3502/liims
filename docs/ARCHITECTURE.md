# BHARAT Study LIMS -- Architecture

## System Overview

```
                        +-----------+
                        |  Browser  |
                        | (React    |
                        |  PWA)     |
                        +-----+-----+
                              |
                              | HTTP :80 / HTTPS :443
                              v
                    +-------------------+
                    |   Nginx (host)    |
                    |                   |
                    | - Static assets   |
                    | - /api/* proxy    |
                    | - Rate limiting   |
                    | - Security hdrs   |
                    | - Gzip            |
                    +--------+----------+
                             |
                +------------+------------+
                |                         |
         /api/* requests          Static files (/, /assets/*)
                |                         |
                v                         v
        +--------------+        +------------------+
        |   FastAPI    |        |   Nginx (inside  |
        |   (Uvicorn)  |        |   frontend       |
        |   :8000      |        |   container)     |
        +-+------+-----+        +------------------+
          |      |
     +----+      +-----+
     |                  |
     v                  v
+----------+     +-----------+
| Postgres |     |   Redis   |
|   15     |     |     7     |
|  :5432   |     |   :6379   |
+----------+     +-----+-----+
                       |
              +--------+--------+
              |                 |
              v                 v
      +--------------+  +--------------+
      | Celery       |  | Celery       |
      | Worker (x4)  |  | Beat         |
      | concurrency  |  | (scheduler)  |
      +--------------+  +--------------+
```

## Docker Service Topology

Six services compose the full stack, defined in `docker-compose.yml`:

| Service | Image | Internal Port | Host Port | Role |
|---------|-------|--------------|-----------|------|
| `frontend` | Node 20 build + Nginx 1.25 | 80 | `${FRONTEND_PORT:-80}` | Serves built React SPA, proxied by host Nginx |
| `api` | Python 3.11-slim + Uvicorn | 8000 | none (internal) | FastAPI application server |
| `celery-worker` | Same as api image | none | none | Background task processing (4 concurrent) |
| `celery-beat` | Same as api image | none | none | Periodic task scheduler |
| `postgres` | postgres:15-alpine | 5432 | none (internal) | Primary data store |
| `redis` | redis:7-alpine | 6379 | none (internal) | Celery broker + result backend + cache |

### Network Segmentation

**Development** (`docker-compose.yml`): All services share a single `liims` bridge network.

**Production** (`docker-compose.prod.yml`): Two isolated networks:

- `frontend` network: Nginx (frontend) + API -- exposed to host
- `backend` network (internal, no host access): API + Celery Worker + Celery Beat + PostgreSQL + Redis

The API container bridges both networks so it can receive proxied requests from Nginx and reach the database and Redis.

### Docker Volumes

| Volume | Mount Point | Purpose |
|--------|-------------|---------|
| `postgres_data` | `/var/lib/postgresql/data` | Persistent database storage |
| `redis_data` | `/data` | Redis AOF persistence |
| `file_store` | `/data/file_store` | Managed file uploads |
| NAS bind mount | `/data/nas` (read-only) | Instrument output files from NAS |

## Request Flow

```
Browser
  |
  +--> GET /dashboard        --> Nginx --> frontend container --> React SPA (index.html)
  |
  +--> GET /api/v1/samples   --> Nginx (rate limit: 30r/s, burst 60)
  |                               --> api container (FastAPI)
  |                                     --> JWT validation
  |                                     --> RBAC check (require_role)
  |                                     --> Service layer
  |                                     --> SQLAlchemy async query
  |                                     --> Pydantic response serialization
  |                                     --> JSON response
  |
  +--> POST /api/v1/auth/login --> Nginx (rate limit: 5r/s, burst 10)
  |                               --> FastAPI --> bcrypt verify
  |                               --> JWT issued + session stored
  |
  +--> GET /api/health        --> Nginx (rate limit: 10r/s)
                                --> DB ping + Redis ping --> 200 or 503
```

## Authentication and Authorization

### JWT Authentication

- **Algorithm**: HS256
- **Expiry**: 24 hours (configurable via `JWT_EXPIRY_HOURS`)
- **Token format**: `{ sub: user_uuid, iat, exp, jti }`
- **Signing key**: `SECRET_KEY` environment variable
- **Password hashing**: bcrypt with configurable rounds (default: 12)
- **Token storage**: SHA-256 hash stored in `user_sessions` table for revocation checks

### Session Management

- Each login creates a `UserSession` record with a SHA-256 hash of the JWT
- Token validation checks the session has not been revoked (`revoked_at IS NULL`) and has not expired
- Logout revokes the session server-side
- Silent token refresh runs every 20 minutes on the frontend; the backend issues a new JWT and rotates the session
- Maximum concurrent sessions: 3 per user (configurable)
- Session timeout: 30 minutes of inactivity (configurable)

### Account Lockout

- 5 failed login attempts within 15 minutes locks the account
- Lockout clears automatically after the window expires
- Successful login clears the failure counter

### Role-Based Access Control (RBAC)

7 roles with graduated permissions:

| Role | Scope |
|------|-------|
| `super_admin` | Full system access |
| `lab_manager` | Lab operations, user management, reports |
| `lab_technician` | Sample processing, storage, instruments |
| `field_coordinator` | Field events, participant enrollment, bulk digitization |
| `data_entry` | Participant and sample data entry |
| `collaborator` | Read-only access to dashboards and reports |
| `pi_researcher` | Read access with data explorer and query builder |

Enforcement: Backend uses `require_role(*roles)` dependency on each route. Frontend uses `<RoleGuard roles={[...]}/>` component on protected routes.

## Database

### Engine

- PostgreSQL 15 with `asyncpg` driver
- Async SQLAlchemy 2.0 (`create_async_engine`, `async_sessionmaker`)
- Connection pool: 20 connections, 10 overflow, pre-ping enabled
- Session lifecycle: auto-commit on success, rollback on exception

### Schema Conventions

All domain models inherit from `BaseModel` which provides:

- **UUID primary key**: `id` column, UUID v4, auto-generated
- **Timestamps**: `created_at` (server default `now()`), `updated_at` (auto-updated)
- **Soft delete**: `is_deleted` (boolean, default false), `deleted_at` (nullable timestamp)

Models that should never be soft-deleted (logs, history) inherit from `BaseModelNoSoftDelete`.

### Domain Models

| File | Models | Description |
|------|--------|-------------|
| `user.py` | User, UserSession | Authentication, roles, session tracking |
| `participant.py` | Participant, ParticipantConsent, ParticipantLocation | Enrollment, demographics, consent, geocoding |
| `sample.py` | Sample, SampleTransfer, DiscardRequest | Specimen lifecycle, chain-of-custody, discard approval |
| `storage.py` | Freezer, Rack, Box, BoxPosition, FreezerEvent | Biobank hierarchy, temperature events |
| `field_ops.py` | FieldEvent, FieldEventParticipant, BulkDigitizeSession | Collection events, check-in, offline digitization |
| `partner.py` | PartnerImport, PartnerResult, StoolKitTracking, OdkSync, OdkSubmission | External lab integration, ODK sync |
| `instrument.py` | Instrument, Plate, PlateWell, InstrumentRun | TECAN plates, mass spec runs |
| `omics.py` | OmicsResult, IccSample | Proteomics, metabolomics, ICC workflow |
| `notification.py` | Notification | System alerts with severity levels |
| `file_store.py` | ManagedFile, WatchDirectory | NAS file discovery, integrity tracking |
| `system.py` | SystemSetting, AuditLog, DashboardCache, ScheduledReport, CollectionSite, Protocol | Configuration, audit trail, caching, SOPs |

### Migrations

Alembic manages schema evolution:

```bash
alembic upgrade head                          # Apply all pending migrations
alembic revision --autogenerate -m "desc"     # Generate migration from model changes
alembic downgrade -1                          # Rollback one migration
alembic history                               # View migration history
```

### Search

Full-text and fuzzy search use PostgreSQL's `pg_trgm` extension with `similarity()` for participant codes and sample barcodes. The `?search=term` query parameter triggers fuzzy matching across relevant text columns.

## Celery Background Tasks

Celery uses Redis as both broker (db 0) and result backend (db 1). Timezone: `Asia/Kolkata`.

### Beat Schedule

| Task | Schedule | Description |
|------|----------|-------------|
| `refresh_dashboard_cache` | Every 15 min (configurable) | Pre-compute dashboard aggregations |
| `sync_odk_submissions` | Weekly, Monday 6:00 AM IST | Pull submissions from ODK Central |
| `scan_watch_directories` | Every 5 min | Discover new files on NAS mount |
| `verify_nas_files` | Hourly | SHA-256 integrity check on managed files |
| `check_backup_health` | Hourly | Alert if last backup is stale |
| `process_scheduled_reports` | Every 15 min | Generate scheduled PDF/CSV reports |

### Worker Configuration

- Development: 4 concurrent worker processes
- Production: 4 concurrent, max 1000 tasks per child (auto-restart), no heartbeat

## Frontend Architecture

### Stack

| Library | Purpose |
|---------|---------|
| React 19 | UI framework |
| TypeScript | Type safety |
| Vite | Build tool and dev server |
| Tailwind CSS v4 | Utility-first styling |
| TanStack Query | Server state management (caching, refetch) |
| Zustand | Client state (auth, notifications) |
| react-hook-form + zod | Form management with schema validation |
| react-router-dom | Client-side routing |
| Plotly.js | Charts and visualizations |
| lucide-react | Icons |
| axios | HTTP client with JWT interceptor |

### Module Organization

```
src/
├── api/                    # TanStack Query hooks -- one file per domain
│   ├── auth.ts             #   login, logout, refresh, me
│   ├── participants.ts     #   CRUD, search, enrollment stats
│   ├── samples.ts          #   CRUD, processing, transport
│   ├── storage.ts          #   freezers, racks, boxes, positions
│   ├── dashboard.ts        #   cached dashboard data
│   ├── data-explorer.ts    #   ad-hoc data analysis
│   ├── instruments.ts      #   plates, runs, ICC
│   ├── ...                 #   (16 files total)
├── features/               # Domain feature modules
│   ├── participants/       #   List, Detail, Form pages
│   ├── samples/            #   List, Detail, Register, Processing, Labels
│   ├── storage/            #   Freezers, Boxes, Search
│   ├── field-ops/          #   Events, Digitization
│   ├── partners/           #   Import, History, ODK, Stool Kits
│   ├── instruments/        #   Dashboard, Plates, Runs, ICC, Omics
│   ├── reports/            #   Enrollment, Inventory, Quality, Sites, Explorer, Query
│   ├── admin/              #   Users, Settings, Audit Logs, Access Logs, Replica
│   ├── files/              #   File Manager
│   ├── notifications/      #   Notification center
│   ├── profile/            #   User profile
│   ├── protocols/          #   SOP library
│   └── sync/               #   Offline sync conflicts
├── components/
│   ├── ui/                 #   Reusable primitives (Button, Card, Table, Dialog, etc.)
│   └── layout/             #   Layout, Sidebar, Header, Breadcrumbs
├── stores/
│   ├── auth.ts             #   Zustand: user, login/logout, checkAuth
│   └── notifications.ts   #   Zustand: polling, unread count
├── lib/
│   ├── api.ts              #   Axios instance, JWT interceptor, silent refresh
│   ├── utils.ts            #   cn() helper (clsx + tailwind-merge)
│   ├── chart-theme.ts      #   Plotly chart color palette and layout defaults
│   ├── offline-store.ts    #   IndexedDB for offline data
│   └── sync-manager.ts     #   Background sync queue
├── pages/                  #   Root-level pages (Dashboard, Login, 404, 403)
├── hooks/                  #   Custom React hooks
└── types/                  #   TypeScript type definitions
```

### PWA / Offline Support

- **Service Worker**: Registered in `main.tsx`, caches static assets and API responses
- **IndexedDB**: Offline store (`offline-store.ts`) for queuing mutations when disconnected
- **Sync Manager**: Background sync (`sync-manager.ts`) replays queued mutations when connectivity returns
- **Auth token sync**: JWT is synced to IndexedDB so the service worker can make authenticated requests

## Security Architecture

### Nginx Layer

- **Rate limiting**: Three zones with different thresholds:
  - Auth endpoints: 5 req/s, burst 10
  - General API: 30 req/s, burst 60
  - Health check: 10 req/s, burst 5
- **Security headers**: X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, Referrer-Policy, Permissions-Policy
- **HSTS**: Available (commented out by default, enable with SSL)
- **Gzip**: Enabled for text, JS, JSON, CSS, XML, SVG
- **Client body limit**: 50 MB

### FastAPI Layer

- **SecurityHeadersMiddleware**: CSP, X-Frame-Options (DENY), HSTS (production only)
- **RequestIDMiddleware**: Unique X-Request-ID on every request/response
- **CORS**: Configurable origins, credentials allowed
- **Application rate limiter**: Sliding window counter per IP or user (`core/rate_limit.py`)
- **Error handlers**: Structured JSON errors, internal details suppressed in production
- **Input validation**: Pydantic v2 models on all endpoints
- **Input sanitization**: `core/sanitize.py` for user-provided text

### Data Protection

- No raw data exports -- only PDFs, TECAN worklists, and label documents
- Participant identifiers never appear in logs, error responses, or test fixtures
- Soft delete prevents accidental permanent data loss
- Audit log tracks all create/update/delete/view/export actions with user attribution
- All passwords hashed with bcrypt (configurable rounds)
- JWT tokens hashed (SHA-256) before database storage

### Production Hardening

The `docker-compose.prod.yml` overlay adds:

- Resource limits (CPU and memory) on all containers
- Internal-only backend network (no host access for Postgres/Redis)
- Log rotation (JSON file driver with max size and file count)
- PostgreSQL tuning (shared_buffers, work_mem, slow query logging)
- Gunicorn with 4 Uvicorn workers (replacing single-process Uvicorn)
- Redis persistence (AOF + RDB snapshots)

## API Response Format

All API responses follow a consistent envelope:

**Success:**
```json
{
  "success": true,
  "data": { ... }
}
```

**Paginated:**
```json
{
  "success": true,
  "data": [ ... ],
  "pagination": {
    "page": 1,
    "per_page": 20,
    "total": 150,
    "pages": 8
  }
}
```

**Error:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed.",
    "details": [
      { "field": "body -> email", "message": "Invalid email", "type": "value_error" }
    ]
  }
}
```

## Branding

| Element | Value |
|---------|-------|
| Font (sans) | Red Hat Display (Google Fonts) |
| Font (mono) | JetBrains Mono |
| Primary Blue | `#3674F6` |
| Teal | `#03B6D9` |
| Gradient | `#3674F6` to `#03B6D9` |
| Success | `#059669` |
| Warning | `#D97706` |
| Danger | `#DC2626` |
