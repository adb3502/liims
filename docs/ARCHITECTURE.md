# LIIMS System Architecture

**Longevity India Information Management System (LIIMS)**

This document describes the system architecture, data model, design patterns, and key technical decisions for the LIIMS platform.

---

## Table of Contents

1. [High-Level Architecture](#1-high-level-architecture)
2. [Service Topology](#2-service-topology)
3. [Directory Structure](#3-directory-structure)
4. [Database Model Relationships](#4-database-model-relationships)
5. [Authentication Flow](#5-authentication-flow)
6. [Background Task Architecture](#6-background-task-architecture)
7. [Key Design Patterns](#7-key-design-patterns)
8. [API Design Conventions](#8-api-design-conventions)
9. [Frontend Architecture](#9-frontend-architecture)
10. [Network and Security](#10-network-and-security)

---

## 1. High-Level Architecture

```
                                 Internet
                                    |
                              +-----+------+
                              |   Nginx    |
                              | (reverse   |
                              |  proxy)    |
                              +--+-----+---+
                                 |     |
                     +-----------+     +------------+
                     |                              |
              +------+-------+             +--------+--------+
              | React SPA    |             | FastAPI          |
              | (Vite build, |             | (uvicorn /       |
              |  served by   |             |  gunicorn in     |
              |  nginx)      |             |  production)     |
              +--------------+             +---+----+----+---+
                                               |    |    |
                                    +----------+    |    +----------+
                                    |               |               |
                             +------+------+  +-----+-----+  +-----+------+
                             | PostgreSQL  |  |   Redis    |  | Celery     |
                             | 15          |  |   7        |  | Worker +   |
                             | (asyncpg)   |  | (broker +  |  | Beat       |
                             |             |  |  cache)    |  |            |
                             +-------------+  +-----------+  +------------+
                                                                    |
                                                              +-----+------+
                                                              | NAS Mount  |
                                                              | (read-only |
                                                              |  file scan)|
                                                              +------------+
```

**Request flow:**

1. Client browser loads the React SPA from Nginx.
2. SPA makes API calls to `/api/v1/*` which Nginx reverse-proxies to the FastAPI backend at port 8000.
3. FastAPI authenticates via JWT, executes business logic using async SQLAlchemy against PostgreSQL.
4. Background tasks (dashboard cache refresh, ODK sync, file scanning, backup health checks, scheduled reports) run on Celery workers with Redis as the broker.
5. NAS-mounted directories are scanned periodically for instrument output files; only metadata (path, hash, size) is stored in the database.

---

## 2. Service Topology

Six Docker Compose services form the runtime:

| Service | Image / Build | Port | Purpose |
|---------|---------------|------|---------|
| `postgres` | postgres:15-alpine | 5432 (internal) | Primary database |
| `redis` | redis:7-alpine | 6379 (internal) | Celery broker, cache, rate limiting |
| `api` | ./backend (Dockerfile) | 8000 (internal) | FastAPI application server |
| `celery-worker` | ./backend | - | Processes async tasks (concurrency=4) |
| `celery-beat` | ./backend | - | Periodic task scheduler |
| `frontend` | ./frontend (Dockerfile) | 80/443 (external) | Nginx serving React build + reverse proxy |

**Production overrides** (`docker-compose.prod.yml`):
- API runs via gunicorn with 4 uvicorn workers
- PostgreSQL tuned (shared_buffers=256MB, work_mem=8MB, etc.)
- Redis maxmemory=512MB with LRU eviction
- Resource limits on all containers
- Separate frontend/backend Docker networks (backend network is internal)
- Structured JSON logging with rotation

---

## 3. Directory Structure

### Backend

```
backend/
  alembic/                  # Database migration scripts
  alembic.ini               # Alembic configuration
  Dockerfile                # Python 3.11+ container build
  pyproject.toml            # Dependencies and project metadata
  app/
    __init__.py
    main.py                 # FastAPI app with CORS, middleware, lifespan
    config.py               # Pydantic Settings (all config from env vars)
    database.py             # Async engine, session factory, Base
    celery_app.py           # Celery instance with beat schedule
    seed.py                 # Database seeding script
    api/
      v1/
        __init__.py         # API router aggregation (all sub-routers)
        auth.py             # Login, logout, refresh, password ops
        users.py            # User CRUD (admin)
        participants.py     # Participant CRUD + consent sub-routes
        samples.py          # Sample lifecycle, aliquots, discards
        storage.py          # Freezers, racks, boxes, positions, temp events
        field_events.py     # Field events, check-ins, bulk digitization
        instruments.py      # Instruments, runs, plates, omics results
        icc.py              # ICC workflow
        dashboard.py        # Dashboard analytics
        reports.py          # Report generation + scheduled reports
        query_builder.py    # Ad-hoc query builder
        files.py            # File store, watch directories
        sync.py             # Offline PWA sync
        partner.py          # ODK, partner imports, canonical tests, stool kits
        notifications.py    # Notification CRUD
        collection_sites.py # Collection site CRUD
        transports.py       # Transport tracking
        labels.py           # Label generation (A4 DOCX)
        qr.py               # QR code generation and lookup
        settings.py         # System settings
    models/
      __init__.py           # Model registry (imports all models)
      base.py               # Mixin classes: UUID PK, Timestamps, Soft Delete
      enums.py              # All enum types
      user.py               # User, UserSession, AuditLog
      participant.py        # Participant, CollectionSite, Consent
      sample.py             # Sample, StatusHistory, DiscardRequest, Transport
      storage.py            # Freezer, Rack, Box, Position, TempEvent
      field_ops.py          # FieldEvent, FieldEventParticipant
      instrument.py         # Instrument, Run, RunSample, Plate, QCTemplate
      omics.py              # OmicsResultSet, OmicsResult, IccProcessing
      partner.py            # ODK*, CanonicalTest, Alias, Import, Result, StoolKit
      notification.py       # Notification
      file_store.py         # ManagedFile, WatchDirectory
      system.py             # SystemSetting, ScheduledReport, DashboardCache
    schemas/                # Pydantic request/response schemas (1 file per domain)
    services/               # Business logic layer (1 file per domain)
    core/
      deps.py               # Auth dependencies (JWT decode, role checker)
      security.py           # JWT creation, password hashing, token hashing
      rate_limit.py         # In-memory rate limiter
      middleware.py         # RequestID, SecurityHeaders middleware
      error_handlers.py     # Global exception handlers
    tasks/
      __init__.py
      notifications.py      # Email notification sending
      reports.py            # Scheduled report generation
      files.py              # Watch directory scanning, NAS file verification
      dashboard.py          # Dashboard cache refresh
      odk.py                # ODK submission sync
      backup.py             # Backup health checks
```

### Frontend

```
frontend/
  Dockerfile                # Multi-stage: node build -> nginx serve
  nginx.conf                # Frontend nginx config (SPA routing)
  vite.config.ts            # Vite build configuration
  package.json              # Dependencies
  src/
    main.tsx                # Entry point
    App.tsx                 # Root component
    router.tsx              # Route definitions with guards
    index.css               # Global styles (Tailwind)
    api/                    # Axios instance with JWT interceptor
    lib/
      api.ts                # Configured axios instance
      utils.ts              # cn() helper (clsx + tailwind-merge)
    stores/
      auth.ts               # Zustand auth store
    hooks/                  # Custom React hooks
    types/                  # TypeScript type definitions
    components/
      ui/                   # Reusable UI primitives (shadcn/ui style)
      layout/               # Layout shell, sidebar, header
      offline/              # Offline/PWA components
      ErrorBoundary.tsx     # Error boundary wrapper
    pages/
      DashboardPage.tsx     # Main dashboard
      LoginPage.tsx         # Login form
      ForbiddenPage.tsx     # 403 page
      NotFoundPage.tsx      # 404 page
    features/
      participants/         # Participant list, detail, form
      samples/              # Sample list, detail, register
      storage/              # Freezer list/detail, box detail, search
      field-ops/            # Field event list/detail, bulk digitize
      partners/             # Import wizard, history, stool kits, ODK sync
      instruments/          # Dashboard, runs, plates, ICC, omics
      reports/              # Enrollment, inventory, quality, query builder
      files/                # File manager
```

---

## 4. Database Model Relationships

### Entity-Relationship Overview

```
CollectionSite 1---* Participant 1---* Sample
                                   1---* Consent
                                   1---* FieldEventParticipant
                                   1---* PartnerLabResult
                                   1---* StoolKit

Sample 1---* SampleStatusHistory
       1---* Sample (aliquots, self-referential via parent_sample_id)
       0..1--- StoragePosition
       1---* InstrumentRunSample
       1---* OmicsResult
       1---* IccProcessing
       *---* SampleTransportItem ---* SampleTransport

Freezer 1---* StorageRack 1---* StorageBox 1---* StoragePosition
Freezer 1---* FreezerTemperatureEvent

FieldEvent 1---* FieldEventParticipant
           1---* SampleTransport

Instrument 1---* InstrumentRun 1---* InstrumentRunSample
                               1---* Plate 1---* InstrumentRunSample
                               1---* OmicsResultSet 1---* OmicsResult

QCTemplate ---0..1 Plate

OdkFormConfig
OdkSyncLog
OdkSubmission ---0..1 Participant

CanonicalTest 1---* TestNameAlias (per partner)
PartnerLabImport 1---* PartnerLabResult ---0..1 CanonicalTest
                                        ---0..1 Participant

User 1---* UserSession
     1---* AuditLog

Notification (recipient_id or recipient_role)
WatchDirectory ---0..1 Instrument
ManagedFile ---0..1 Instrument

SystemSetting (category + key)
ScheduledReport
DashboardCache (type -> JSON blob)
```

### Core Models

| Model | Table | PK | Key Columns |
|-------|-------|----|-------------|
| User | user | UUID | email (unique), role, password_hash, is_active |
| UserSession | user_session | UUID | user_id (FK), token_hash, expires_at, revoked_at |
| AuditLog | audit_log | UUID | user_id, action, entity_type, entity_id, old/new_values, timestamp |
| CollectionSite | collection_site | UUID | code (unique), name, participant_range_start/end |
| Participant | participant | UUID | participant_code (unique), group_code, age_group, sex, site_id, wave |
| Consent | consent | UUID | participant_id, consent_type, consent_given, consent_date |
| Sample | sample | UUID | sample_code (unique), participant_id, sample_type, status, volumes |
| SampleStatusHistory | sample_status_history | UUID | sample_id, previous_status, new_status, changed_at |
| SampleDiscardRequest | sample_discard_request | UUID | sample_id, reason, status (pending/approved/rejected) |
| SampleTransport | sample_transport | UUID | transport_type, origin, destination, cold_chain_method |
| Freezer | freezer | UUID | name, freezer_type, location, is_active |
| StorageRack | storage_rack | UUID | freezer_id, rack_name, position_in_freezer |
| StorageBox | storage_box | UUID | rack_id, box_name, rows, columns, box_type, group_code |
| StoragePosition | storage_position | UUID | box_id, row, column, sample_id (unique constraint on box+row+col) |
| FreezerTemperatureEvent | freezer_temperature_event | UUID | freezer_id, event_type, observed_temp_c |
| FieldEvent | field_event | UUID | event_name, event_date, site_id, status, coordinator_id |
| FieldEventParticipant | field_event_participant | UUID | event_id, participant_id, check_in_time, samples_collected (JSONB) |
| Instrument | instrument | UUID | name, instrument_type, manufacturer, watch_directory |
| InstrumentRun | instrument_run | UUID | instrument_id, run_type, status, qc_status |
| InstrumentRunSample | instrument_run_sample | UUID | run_id, sample_id, plate_id, well_position |
| Plate | plate | UUID | plate_name, run_id, rows(8), columns(12), randomization_config |
| QCTemplate | qc_template | UUID | name, template_data (JSONB), run_type |
| OmicsResultSet | omics_result_set | UUID | run_id, result_type, total_features, total_samples |
| OmicsResult | omics_result | UUID | result_set_id, sample_id, feature_id, quantification_value |
| IccProcessing | icc_processing | UUID | sample_id, status (10-step workflow), antibody_panel |
| OdkFormConfig | odk_form_config | UUID | form_id, field_mapping (JSONB) |
| OdkSyncLog | odk_sync_log | UUID | status, submissions_found/processed/failed |
| OdkSubmission | odk_submission | UUID | odk_instance_id (unique), submission_data (JSONB) |
| CanonicalTest | canonical_test | UUID | canonical_name (unique), category, standard_unit, reference ranges |
| TestNameAlias | test_name_alias | UUID | canonical_test_id, partner_name, alias_name, conversion_factor |
| PartnerLabImport | partner_lab_import | UUID | partner_name, records_total/matched/failed |
| PartnerLabResult | partner_lab_result | UUID | import_id, participant_id, test_name_raw, canonical_test_id |
| StoolKit | stool_kit | UUID | participant_id, kit_code, status, issued_at |
| Notification | notification | UUID | recipient_id or recipient_role, type, severity, is_read |
| ManagedFile | managed_file | UUID | file_path (unique), checksum_sha256, category |
| WatchDirectory | watch_directory | UUID | path (unique), file_pattern, category, is_active |
| SystemSetting | system_setting | UUID | category + key (unique), value, value_type |
| ScheduledReport | scheduled_report | UUID | report_type, schedule_cron, recipients (JSONB) |
| DashboardCache | dashboard_cache | UUID | dashboard_type, cache_data (JSONB), computed_at |

### Base Model Mixins

All models inherit from one of these base classes defined in `app/models/base.py`:

- **BaseModel** (most entities): UUID PK + created_at + updated_at + is_deleted + deleted_at
- **BaseModelNoSoftDelete** (log/history tables): UUID PK + created_at + updated_at
- **UUIDPrimaryKeyMixin + Base** (junction/simple tables): UUID PK only

---

## 5. Authentication Flow

### Login

```
Client                  FastAPI                    PostgreSQL
  |                        |                          |
  |-- POST /auth/login --> |                          |
  |   {email, password}    |                          |
  |                        |-- check rate limit ------>|
  |                        |-- check account lockout ->|
  |                        |-- verify password hash -->|
  |                        |-- create UserSession ---->|
  |                        |   (store token_hash,      |
  |                        |    IP, user_agent,        |
  |                        |    expires_at)            |
  |<-- {access_token, ---- |                          |
  |     user, expires_in}  |                          |
```

### Request Authentication

```
Client                  FastAPI                    PostgreSQL
  |                        |                          |
  |-- GET /api/v1/... ---> |                          |
  |   Authorization:       |                          |
  |   Bearer <JWT>         |                          |
  |                        |-- decode JWT ------------>|
  |                        |   (verify signature,      |
  |                        |    check expiry)          |
  |                        |-- verify session -------->|
  |                        |   (token_hash not revoked,|
  |                        |    not expired)           |
  |                        |-- load User ------------->|
  |                        |   (is_deleted=false,      |
  |                        |    is_active=true)        |
  |                        |-- check role (RBAC) ----->|
  |                        |                          |
  |<-- response ---------- |                          |
```

### Key Security Features

- **JWT tokens:** HS256 algorithm, configurable expiry (default 24 hours)
- **Session tracking:** Every JWT is backed by a UserSession row. Revoking a session invalidates the token immediately.
- **Account lockout:** Too many failed login attempts lock the account for 15 minutes.
- **Rate limiting:** Login endpoint limited to 10 requests/minute per IP. Additional nginx-level rate limiting.
- **Password hashing:** bcrypt with configurable rounds (default 12).
- **RBAC:** Role-based access control via `require_role()` dependency factory. Seven roles with hierarchical permissions.
- **Max concurrent sessions:** Configurable (default 3).
- **Security headers:** X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, Referrer-Policy, Permissions-Policy added to every response.
- **Request IDs:** Unique request ID injected via middleware for traceability.
- **Production safety:** Application refuses to start with default SECRET_KEY in non-debug mode.

---

## 6. Background Task Architecture

### Celery Configuration

- **Broker:** Redis (db 0)
- **Result backend:** Redis (db 1)
- **Timezone:** Asia/Kolkata (UTC enabled)
- **Serialization:** JSON
- **Worker concurrency:** 4 (production: max-tasks-per-child=1000)

### Beat Schedule (Periodic Tasks)

| Task | Schedule | Description |
|------|----------|-------------|
| `refresh_dashboard_cache` | Every 15 minutes | Pre-computes dashboard analytics and stores in DashboardCache |
| `sync_odk_submissions` | Every 60 minutes | Pulls new submissions from ODK Central |
| `scan_watch_directories` | Every 5 minutes | Scans NAS watch directories for new files |
| `verify_nas_files` | Every 60 minutes | Verifies SHA-256 checksums of existing NAS files |
| `check_backup_health` | Every 60 minutes | Checks backup recency, emits notification if stale |
| `process_scheduled_reports` | Every 15 minutes | Generates and emails scheduled PDF reports |

### Task Modules

```
app/tasks/
  dashboard.py       # refresh_dashboard_cache
  odk.py             # sync_odk_submissions
  files.py           # scan_watch_directories, verify_nas_files
  backup.py          # check_backup_health
  reports.py         # process_scheduled_reports
  notifications.py   # send_email_notification (called by other tasks)
```

---

## 7. Key Design Patterns

### Soft Delete

All primary entities (participants, samples, users, freezers, etc.) use soft delete via the `SoftDeleteMixin`:

```python
class SoftDeleteMixin:
    is_deleted: Mapped[bool] = mapped_column(default=False)
    deleted_at: Mapped[datetime | None] = mapped_column(nullable=True)
```

All queries filter `is_deleted == False` by default. Log and history tables (SampleStatusHistory, AuditLog, etc.) use `BaseModelNoSoftDelete` and are never deleted.

### Audit Logging

All significant mutations are recorded in the `audit_log` table with:
- User ID, action (create/update/delete/view/export)
- Entity type and ID
- Old and new values as JSONB
- IP address and timestamp
- Additional context

### UUID Primary Keys

Every table uses UUID v4 primary keys for security (no sequential ID enumeration) and distributed-system compatibility:

```python
id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
```

### pg_trgm Fuzzy Search

Participant and sample search uses PostgreSQL's `pg_trgm` extension with GIN indexes for fuzzy matching. The `?search=term` query parameter triggers trigram similarity search, tolerating typos and partial matches.

### Pagination Convention

All list endpoints use consistent pagination:

```
?page=1&per_page=20&sort=created_at&order=desc
```

Response meta block:

```json
{
  "meta": {
    "page": 1,
    "per_page": 20,
    "total": 150,
    "total_pages": 8
  }
}
```

### Service Layer Pattern

Route handlers (thin controllers) delegate to service classes:

```
Route Handler -> Service -> SQLAlchemy Models -> PostgreSQL
```

Each domain has its own service class (e.g., `ParticipantService`, `SampleService`, `StorageService`). Services contain all business logic, validation, and database queries. Route handlers only handle HTTP concerns (status codes, response formatting, dependency injection).

### Status Transition Validation

Sample status changes and field event status changes are validated server-side. Invalid transitions (e.g., jumping from "registered" to "stored") raise `ValueError` which the route handler converts to HTTP 400.

### Row-Level Locking

Storage position assignment uses `SELECT ... FOR UPDATE` to prevent concurrent assignment of the same position to multiple samples.

### Dashboard Caching

Dashboard analytics are expensive queries. They are pre-computed by a Celery beat task every 15 minutes and stored in the `dashboard_cache` table as JSONB. The dashboard API endpoints read from cache, resulting in sub-millisecond response times.

---

## 8. API Design Conventions

- **Base path:** `/api/v1`
- **Response envelope:** `{ "success": true, "data": ..., "meta": ... }`
- **Error format:** `{ "detail": "Error message" }` with appropriate HTTP status
- **Auth header:** `Authorization: Bearer <JWT>`
- **Content-Type:** `application/json` (except file downloads: PDF, CSV, ZIP, DOCX, PNG)
- **Rate limiting:** Applied at both nginx level (general: 30r/s, auth: 5r/s) and application level (login: 10/min, reports: 5/min, query builder: 20/min)
- **OpenAPI docs:** Available at `/api/docs` (Swagger UI) and `/api/openapi.json`

---

## 9. Frontend Architecture

### Technology Stack

| Technology | Purpose |
|------------|---------|
| React 19 | UI framework |
| TypeScript | Type safety |
| Vite | Build tool and dev server |
| Tailwind CSS v4 | Utility-first styling |
| TanStack Query | Server state management (caching, refetching) |
| Zustand | Client state management (auth, UI) |
| react-hook-form + zod | Form handling and validation |
| react-router-dom | Client-side routing |
| axios | HTTP client with JWT interceptor |
| lucide-react | Icon library |

### Route Structure

```
/login                       - Login page (guest only)
/                            - Dashboard (protected)
/participants                - Participant list
/participants/create         - Create participant
/participants/:id            - Participant detail
/samples                     - Sample list
/samples/register            - Register sample
/samples/:id                 - Sample detail
/storage/freezers            - Freezer list
/storage/freezers/:id        - Freezer detail
/storage/boxes/:id           - Box detail (grid view)
/storage/search              - Storage search
/field-ops/events            - Field event list
/field-ops/events/:id        - Event detail
/field-ops/events/:id/digitize - Bulk digitize
/partners/import             - Import wizard
/partners/history            - Import history
/partners/stool-kits         - Stool kit tracker
/partners/odk-sync           - ODK sync status
/instruments                 - Instrument dashboard
/instruments/runs            - Run list
/instruments/runs/:id        - Run detail
/instruments/plates           - Plate designer
/instruments/plates/:id       - Plate detail
/instruments/omics           - Omics results browser
/instruments/icc             - ICC workflow tracker
/reports/enrollment          - Enrollment dashboard
/reports/inventory           - Inventory dashboard
/reports/quality             - Quality dashboard
/reports/query-builder       - Ad-hoc query builder
/reports/data-availability   - Report generator
/admin/users                 - User management
/admin/audit-logs            - Audit logs
/admin/settings              - System settings
/admin/files                 - File manager
/notifications               - Notification center
```

### Key Patterns

- **Route guards:** `ProtectedRoute` (requires auth), `GuestRoute` (login only when not authenticated), `RoleGuard` (checks user role against allowed roles).
- **API client:** Centralized axios instance in `@/lib/api.ts` that automatically attaches the JWT from the Zustand auth store and handles 401 responses (auto-logout).
- **Path alias:** `@/` maps to `./src/` for clean imports.

---

## 10. Network and Security

### Docker Network Topology (Production)

```
                    [frontend network]
                     |            |
                  frontend       api
                                  |
                    [backend network - internal]
                     |      |        |        |
                    api   postgres  redis  celery-*
```

The backend network is marked `internal: true` in production, meaning PostgreSQL and Redis are not reachable from outside Docker.

### Nginx Security

- Rate limiting zones: `api_general` (30r/s), `api_auth` (5r/s), `api_health` (10r/s)
- Security headers on all responses (X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, Referrer-Policy, Permissions-Policy)
- SSL/TLS ready with commented-out configuration (TLSv1.2+, HSTS)
- Client max body size: 50 MB
- Gzip compression for text, JSON, JavaScript, CSS, SVG

### Environment Variables

All configuration is via environment variables, loaded through Pydantic Settings. No secrets are committed to the repository. The application validates critical settings at startup (e.g., rejecting default SECRET_KEY in production).
