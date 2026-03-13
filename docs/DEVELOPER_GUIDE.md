# BHARAT Study LIMS -- Developer Guide

A comprehensive walkthrough of the LIMS codebase for developers and AI agents. This document covers how the backend and frontend are structured, the patterns used throughout, and step-by-step recipes for common development tasks.

---

## Table of Contents

1. [Backend Architecture](#backend-architecture)
2. [Frontend Architecture](#frontend-architecture)
3. [Common Patterns](#common-patterns)
4. [Development Commands](#development-commands)
5. [Debugging Tips](#debugging-tips)
6. [Environment Variables Reference](#environment-variables-reference)

---

## Backend Architecture

The backend is a Python 3.11+ FastAPI application using async SQLAlchemy 2.0 with PostgreSQL.

### Entry Point: `app/main.py`

Creates the FastAPI application with:

- **Lifespan handler**: Validates `SECRET_KEY` is not the default on startup (unless `DEBUG=true`). Disposes the SQLAlchemy engine on shutdown.
- **Middleware stack** (outermost first):
  1. `SecurityHeadersMiddleware` -- CSP, X-Frame-Options, HSTS (production)
  2. `RequestIDMiddleware` -- injects/propagates `X-Request-ID`
  3. `CORSMiddleware` -- configurable origins, credentials, methods
- **Error handlers**: Registered via `register_error_handlers(app)` for HTTP exceptions, validation errors, ValueErrors, SQLAlchemy errors, and unhandled exceptions.
- **Routes**: `api_router` from `app/api/v1/` mounted at `/api/v1`.
- **Health check**: `GET /api/health` -- pings database and Redis, returns `200` (healthy) or `503` (degraded) with latency measurements.

API docs: `GET /api/docs` (Swagger UI), `GET /api/openapi.json`.

### Configuration: `app/config.py`

A single `Settings` class using `pydantic-settings`. All configuration comes from environment variables. The `settings` singleton is imported throughout the application.

Key settings groups:
- **Application**: `APP_NAME`, `APP_VERSION`, `DEBUG`
- **Database**: `DATABASE_URL` (asyncpg), `REPLICA_DATABASE_URL`
- **Redis**: `REDIS_URL`
- **Security**: `SECRET_KEY`, `JWT_EXPIRY_HOURS`, `JWT_ALGORITHM` (HS256), `BCRYPT_ROUNDS`
- **CORS**: `CORS_ORIGINS` (list of strings)
- **Session**: `SESSION_TIMEOUT_MINUTES`, `MAX_CONCURRENT_SESSIONS`
- **ODK**: `ODK_CENTRAL_URL`, `ODK_CENTRAL_EMAIL`, `ODK_CENTRAL_PASSWORD`, `ODK_PROJECT_ID`, `ODK_FORM_ID`
- **SMTP**: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_NAME`, `SMTP_USE_TLS`
- **Storage**: `NAS_MOUNT_PATH`, `FILE_STORE_PATH`, `FILE_STORE_MAX_SIZE_MB`
- **Celery**: `CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND`
- **Dashboard**: `DASHBOARD_REFRESH_INTERVAL_MINUTES`

### Database: `app/database.py`

```python
engine = create_async_engine(DATABASE_URL, pool_size=20, max_overflow=10, pool_pre_ping=True)
async_session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
```

The `get_db()` async generator is used as a FastAPI dependency. It yields a session, auto-commits on success, and rolls back on exception.

`Base` is the SQLAlchemy `DeclarativeBase` that all models inherit from (via mixins in `app/models/base.py`).

### Models: `app/models/`

One file per domain. All domain models inherit from `BaseModel` which provides:

```python
class BaseModel(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    __abstract__ = True
```

- `UUIDPrimaryKeyMixin`: `id: UUID` primary key, auto-generated UUID v4
- `TimestampMixin`: `created_at`, `updated_at` with server defaults
- `SoftDeleteMixin`: `is_deleted` (bool), `deleted_at` (nullable datetime)

Log/history tables use `BaseModelNoSoftDelete` (no `is_deleted` column).

**Enums** (`app/models/enums.py`): All enum types in one file -- `UserRole`, `SampleType`, `SampleStatus`, `FreezerType`, `BoxType`, `AuditAction`, `NotificationType`, and many more. Python `enum.Enum` subclasses that map to PostgreSQL enum columns.

`UserRole` values (as of migration 005): `SUPER_ADMIN`, `LII_PI_RESEARCHER`, `SCIENTIST`, `ICMR_CAR_JRF`, `ICMR_CAR_POSTDOC`, `FIELD_OPERATIVE`, `CLINICAL_TEAM`, `CLINICAL_PARTNER`, `PI_RESEARCHER`.

**Model files**:

| File | Key Models |
|------|------------|
| `user.py` | `User` (role, is_active, password_hash), `UserSession` (token_hash, expires_at, revoked_at) |
| `participant.py` | `Participant` (code, age_group, sex, site), `ParticipantConsent`, `ParticipantLocation` |
| `sample.py` | `Sample` (barcode, type, status), `SampleTransfer`, `DiscardRequest` |
| `storage.py` | `Freezer`, `Rack`, `Box` (rows, cols, type), `BoxPosition`, `FreezerEvent` |
| `field_ops.py` | `FieldEvent`, `FieldEventParticipant`, `BulkDigitizeSession` |
| `partner.py` | `PartnerImport`, `PartnerResult`, `StoolKitTracking`, `OdkSync`, `OdkSubmission` |
| `instrument.py` | `Instrument`, `Plate`, `PlateWell`, `InstrumentRun` |
| `omics.py` | `OmicsResult`, `IccSample` |
| `notification.py` | `Notification` (type, severity, message, is_read) |
| `file_store.py` | `ManagedFile` (path, sha256, size), `WatchDirectory` |
| `system.py` | `SystemSetting`, `AuditLog`, `DashboardCache`, `ScheduledReport`, `CollectionSite`, `Protocol` |

### Schemas: `app/schemas/`

Pydantic v2 models for request validation and response serialization. One file per domain, mirroring the models structure.

Naming convention:
- `{Entity}Create` -- request body for POST
- `{Entity}Update` -- request body for PUT/PATCH
- `{Entity}Response` -- response body (includes `id`, timestamps)
- `{Entity}ListResponse` -- paginated list response

### Services: `app/services/`

Business logic layer. One file per domain. Services contain all business rules, validation logic, and database queries. Route handlers call services -- they do not contain query logic directly.

Pattern:
```python
# app/services/participant.py
async def create_participant(db: AsyncSession, data: ParticipantCreate, user: User) -> Participant:
    # Validate business rules
    # Create the entity
    # Create audit log entry
    # Return the entity
```

### Routes: `app/api/v1/`

25 route files registered in `app/api/v1/__init__.py`. Each file creates an `APIRouter` with a prefix and tags.

The `api_router` aggregates all sub-routers under `/api/v1`:

| Route File | Prefix | Key Endpoints |
|------------|--------|---------------|
| `auth.py` | `/auth` | `POST /login`, `POST /logout`, `POST /refresh`, `GET /me` |
| `users.py` | `/users` | CRUD + role management |
| `participants.py` | `/participants` | CRUD + search + enrollment stats |
| `samples.py` | `/samples` | CRUD + processing + transport |
| `storage.py` | `/storage` | Freezers, racks, boxes, positions |
| `transports.py` | `/transports` | Sample transport batches |
| `field_events.py` | `/field-events` | Collection event management |
| `partner.py` | `/partners` | Import/export, stool kits |
| `instruments.py` | `/instruments` | Plates, runs, wells |
| `icc.py` | `/icc` | ICC workflow stages |
| `dashboard.py` | `/dashboard` | Cached dashboard data |
| `data_explorer.py` | `/data-explorer` | Ad-hoc data analysis — distribution, scatter, correlation, metadata table, strata |
| `reports.py` | `/reports` | PDF generation, scheduled reports |
| `query_builder.py` | `/query-builder` | Dynamic query execution |
| `labels.py` | `/labels` | A4 label sheet generation |
| `qr.py` | `/qr` | QR code generation |
| `files.py` | `/files` | File manager, NAS integration |
| `notifications.py` | `/notifications` | List, mark read, dismiss |
| `settings.py` | `/settings` | System configuration |
| `sync.py` | `/sync` | Offline sync conflicts |
| `audit_logs.py` | `/audit-logs` | Audit trail query |
| `collection_sites.py` | `/sites` | Site management |
| `protocols.py` | `/protocols` | SOP library |
| `participant_locations.py` | `/participant-locations` | Geocoding data |

### Key Data Explorer Endpoints

`GET /api/v1/data-explorer/parameters` — list all available numeric parameters (clinical JSONB + lab tests).

`GET /api/v1/data-explorer/strata` — list categorical JSONB fields available for stratification (dietary_pattern, exercise, smoking_status, etc.).

`GET /api/v1/data-explorer/distribution` — distribution data with optional `group_by` (age_group/sex/site) or `strata` (categorical field from /strata). Supports `age_group`, `sex`, `site` cohort filters.

`GET /api/v1/data-explorer/scatter` — scatter plot data for two parameters with Pearson/Spearman correlation, R², and linear regression stats.

`GET /api/v1/data-explorer/correlation` — pairwise Pearson/Spearman correlation matrix across selected parameters.

`GET /api/v1/data-explorer/metadata-table` — paginated flat table of participant core fields + demographic/lifestyle/clinical score fields extracted from the clinical_data JSONB column.

### Tasks: `app/tasks/`

Celery background tasks, auto-discovered from `app.tasks`:

| File | Tasks |
|------|-------|
| `dashboard.py` | `refresh_dashboard_cache` -- pre-compute and cache all dashboard aggregations |
| `odk.py` | `sync_odk_submissions` -- pull new submissions from ODK Central |
| `files.py` | `scan_watch_directories`, `verify_nas_files` -- NAS file discovery and integrity |
| `reports.py` | `process_scheduled_reports` -- generate scheduled PDF/CSV reports |
| `notifications.py` | Alert generation for various system events |

The Celery app is configured in `app/celery_app.py` with a beat schedule.

### Core: `app/core/`

| File | Purpose |
|------|---------|
| `security.py` | `hash_password`, `verify_password` (bcrypt), `create_access_token`, `decode_access_token` (JWT), `hash_token` (SHA-256) |
| `deps.py` | `get_current_user` (JWT extraction + session validation), `get_current_active_user`, `require_role(*roles)` dependency factory |
| `middleware.py` | `RequestIDMiddleware`, `SecurityHeadersMiddleware` |
| `rate_limit.py` | `RateLimiter` dependency (sliding window), `record_failed_login`, `is_account_locked`, `clear_failed_logins` |
| `error_handlers.py` | Structured JSON error responses for HTTP, validation, ValueError, SQLAlchemy, and unhandled exceptions |
| `sanitize.py` | Input sanitization for user-provided text |
| `email.py` | SMTP email sending for notifications |

---

## Frontend Architecture

The frontend is a React 19 single-page application built with Vite and TypeScript.

### Entry Point: `src/main.tsx`

Renders the `<App />` component inside `<StrictMode>` and `<ErrorBoundary>`. Registers the service worker for PWA support.

### App Component: `src/App.tsx`

Sets up providers in this order:

1. `<QueryClientProvider>` -- TanStack Query with 5-minute stale time, 1 retry, no refetch on window focus
2. `<AuthInitializer>` -- calls `checkAuth()` on mount, starts notification polling and sync manager when authenticated
3. `<RouterProvider>` -- react-router-dom with route definitions from `router.tsx`
4. `<ToastContainer>` -- global toast notifications

### Router: `src/router.tsx`

Defines all routes with three guard components:

- **`ProtectedRoute`**: Redirects to `/login` if not authenticated. Shows spinner while auth is loading.
- **`GuestRoute`**: Redirects to `/` if already authenticated (used for login page).
- **`RoleGuard`**: Shows `<ForbiddenPage />` if the user's role is not in the allowed list.

Route structure:

```
/login                          -- GuestRoute -> LoginPage
/                               -- ProtectedRoute -> Layout
  /                             -- DashboardPage (index)
  /participants                 -- ParticipantListPage
  /participants/create          -- RoleGuard -> ParticipantForm
  /participants/:id             -- ParticipantDetailPage
  /samples                      -- SampleListPage
  /samples/register             -- RoleGuard -> SampleRegisterForm
  /samples/processing           -- SampleProcessingPage
  /samples/labels               -- LabelGeneratorPage
  /storage/freezers             -- FreezerListPage
  /storage/freezers/:id         -- FreezerDetailPage
  /storage/boxes/:id            -- BoxDetailPage
  /field-ops/events             -- RoleGuard -> FieldEventListPage
  /field-ops/events/:id         -- FieldEventDetailPage
  /field-ops/events/:id/digitize -- BulkDigitizePage
  /partners/import              -- ImportWizardPage
  /partners/results             -- PartnerResultsPage
  /partners/stool-kits          -- StoolKitTrackerPage
  /instruments                  -- InstrumentDashboardPage
  /instruments/plates           -- PlateDesignerPage
  /instruments/runs             -- InstrumentRunsPage
  /instruments/omics            -- OmicsResultsPage
  /instruments/icc              -- IccWorkflowPage
  /reports/enrollment                    -- EnrollmentDashboardPage
  /reports/enrollment/sites/:siteCode    -- SiteEnrollmentDashboardPage (per-site drill-down)
  /reports/inventory                     -- InventoryDashboardPage
  /reports/quality                       -- QualityDashboardPage
  /reports/sites                         -- SitesDashboardPage
  /reports/data-availability             -- ReportGeneratorPage
  /reports/data-explorer                 -- DataExplorerPage (distribution, scatter, correlation)
  /reports/metadata-explorer             -- MetadataExplorerPage (participant metadata table)
  /reports/query-builder                 -- QueryBuilderPage
  /admin/users                           -- RoleGuard -> UserManagementPage
  /admin/users/:id                       -- UserDetailPage
  /admin/replica                         -- ReadReplicaPage
  /admin/audit-logs                      -- AuditLogsPage
  /admin/access-logs                     -- AccessLogsPage
  /admin/reports                         -- ScheduledReportsPage
  /admin/settings                        -- SystemSettingsPage
  /admin/files                           -- FileManagerPage
  /notifications                         -- NotificationsPage
  /profile                               -- ProfilePage
  /protocols                             -- ProtocolsPage
  *                                      -- NotFoundPage
```

### Pages: `src/pages/`

Root-level pages not belonging to a specific feature:

- `DashboardPage.tsx` -- main landing page with summary cards and charts
- `LoginPage.tsx` -- username/password login form
- `NotFoundPage.tsx` -- 404 page
- `ForbiddenPage.tsx` -- 403 page

### Features: `src/features/`

Each feature module is a directory containing page components, sub-components, and hooks specific to that domain. There are 13 feature directories:

| Directory | Contents |
|-----------|----------|
| `participants/` | List, Detail, Form pages |
| `samples/` | List, Detail, Register, Processing, Labels pages |
| `storage/` | Freezer List/Detail, Box Detail, Storage Search |
| `field-ops/` | Event List/Detail, Bulk Digitize |
| `partners/` | Import Wizard, History, ODK Sync, Stool Kit Tracker, Results |
| `instruments/` | Dashboard, Plates, Runs, Run Detail, ICC, Omics, Sample Queue |
| `reports/` | Enrollment, SiteEnrollment (per-site drill-down), Inventory, Quality, Sites, DataExplorer, MetadataExplorer, QueryBuilder, ReportGenerator |
| `admin/` | User Management, User Detail, System Settings, Audit Logs, Access Logs, Scheduled Reports, Read Replica |
| `files/` | File Manager |
| `notifications/` | Notification center |
| `profile/` | User profile page |
| `protocols/` | SOP library |
| `sync/` | Sync conflict resolution |

### API Layer: `src/api/`

TanStack Query hooks organized one file per domain (16 files). Each file exports:

- Query hooks: `useParticipants()`, `useParticipant(id)`, etc.
- Mutation hooks: `useCreateParticipant()`, `useUpdateParticipant()`, etc.

All hooks use the axios instance from `@/lib/api.ts` which auto-attaches the JWT token.

Example pattern:

```typescript
// src/api/participants.ts
export function useParticipants(params: ParticipantListParams) {
  return useQuery({
    queryKey: ['participants', params],
    queryFn: () => api.get('/participants', { params }).then(r => r.data),
  })
}

export function useCreateParticipant() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: ParticipantCreate) => api.post('/participants', data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['participants'] }),
  })
}
```

### Stores: `src/stores/`

Zustand stores for client-side state:

- **`auth.ts`**: `user`, `isAuthenticated`, `isLoading`, `error`. Actions: `login()`, `logout()`, `checkAuth()`, `clearError()`. On login, stores JWT in `localStorage` and starts the token refresh timer. On logout, revokes the session server-side, clears the token, and stops the timer.

- **`notifications.ts`**: Polling-based notification state. Starts polling on authentication, stops on logout.

### Components

**`src/components/ui/`** -- Reusable primitives (shadcn/ui-style):

| Component | Purpose |
|-----------|---------|
| `button.tsx` | Button with variants (primary, secondary, ghost, danger) |
| `card.tsx` | Card container |
| `chart-card.tsx` | Card wrapper for Plotly charts |
| `dialog.tsx` | Modal dialog |
| `input.tsx` | Text input |
| `select.tsx` | Dropdown select |
| `label.tsx` | Form label |
| `table.tsx` | Data table with sorting |
| `tabs.tsx` | Tab navigation |
| `toast.tsx` | Toast notification system |
| `spinner.tsx` | Loading spinner |
| `badge.tsx` | Status badge |
| `stat-card.tsx` | Metric display card |
| `page-header.tsx` | Page title with breadcrumbs |
| `empty-state.tsx` | Empty state placeholder |

**`src/components/layout/`** -- Application shell:

| Component | Purpose |
|-----------|---------|
| `Layout.tsx` | Main layout with sidebar, header, and content area |
| `Sidebar.tsx` | Navigation sidebar with collapsible sections |
| `Header.tsx` | Top bar with user menu, notifications, breadcrumbs |
| `Breadcrumbs.tsx` | Breadcrumb navigation |

### Lib: `src/lib/`

| File | Purpose |
|------|---------|
| `api.ts` | Axios instance with base URL `/api/v1`, JWT request interceptor, 401 response interceptor with silent refresh, token management (localStorage), refresh timer (every 20 min) |
| `utils.ts` | `cn()` helper -- combines `clsx` and `tailwind-merge` for conditional class names |
| `chart-theme.ts` | Plotly chart color palette and layout defaults matching the Longevity India branding |
| `offline-store.ts` | IndexedDB wrapper for offline data caching and mutation queue |
| `sync-manager.ts` | Background sync queue -- replays queued mutations when online |
| `service-worker-registration.ts` | Service worker registration for PWA |

---

## Common Patterns

### Adding a New API Endpoint

1. **Define the schema** in `backend/app/schemas/{domain}.py`:
   ```python
   class WidgetCreate(BaseModel):
       name: str = Field(..., min_length=1, max_length=200)
       description: str | None = None

   class WidgetResponse(BaseModel):
       id: uuid.UUID
       name: str
       description: str | None
       created_at: datetime
   ```

2. **Add the service function** in `backend/app/services/{domain}.py`:
   ```python
   async def create_widget(db: AsyncSession, data: WidgetCreate, user: User) -> Widget:
       widget = Widget(**data.model_dump(), created_by=user.id)
       db.add(widget)
       await db.flush()
       return widget
   ```

3. **Create the route** in `backend/app/api/v1/{domain}.py`:
   ```python
   from app.core.deps import get_current_active_user, get_db, require_role
   from app.models.enums import UserRole

   router = APIRouter(prefix="/widgets", tags=["Widgets"])

   @router.post("", response_model=dict)
   async def create_widget(
       data: WidgetCreate,
       db: AsyncSession = Depends(get_db),
       user: User = Depends(require_role(UserRole.SUPER_ADMIN, UserRole.LII_PI_RESEARCHER)),
   ):
       widget = await widget_service.create_widget(db, data, user)
       return {"success": True, "data": WidgetResponse.model_validate(widget)}
   ```

4. **Register the router** in `backend/app/api/v1/__init__.py`:
   ```python
   from app.api.v1.widgets import router as widgets_router
   api_router.include_router(widgets_router)
   ```

### Adding a New Frontend Page

1. **Create the API hook** in `frontend/src/api/{domain}.ts`:
   ```typescript
   import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
   import api from '@/lib/api'

   export function useWidgets() {
     return useQuery({
       queryKey: ['widgets'],
       queryFn: () => api.get('/widgets').then(r => r.data.data),
     })
   }
   ```

2. **Create the page component** in `frontend/src/features/{domain}/WidgetListPage.tsx`:
   ```typescript
   import { PageHeader } from '@/components/ui/page-header'
   import { useWidgets } from '@/api/widgets'

   export function WidgetListPage() {
     const { data, isLoading, error } = useWidgets()

     if (isLoading) return <Spinner />
     if (error) return <ErrorState message={extractErrorMessage(error)} />
     if (!data?.length) return <EmptyState title="No widgets" />

     return (
       <div>
         <PageHeader title="Widgets" />
         {/* Table/list rendering */}
       </div>
     )
   }
   ```

3. **Add the route** in `frontend/src/router.tsx`:
   ```typescript
   import { WidgetListPage } from '@/features/widgets/WidgetListPage'

   // Inside the children array of the Layout route:
   { path: 'widgets', element: <WidgetListPage /> },
   ```

4. **Add navigation** in the Sidebar component if needed.

### Soft Delete Pattern

All queries must filter out soft-deleted records:

```python
# Correct
result = await db.execute(
    select(Participant).where(
        Participant.is_deleted == False,  # noqa: E712
        Participant.id == participant_id,
    )
)

# Delete (soft)
participant.is_deleted = True
participant.deleted_at = datetime.now(timezone.utc)
```

### Pagination Pattern

Backend accepts `?page=1&per_page=20&sort=created_at&order=desc`:

```python
@router.get("")
async def list_widgets(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    sort: str = Query("created_at"),
    order: str = Query("desc"),
    db: AsyncSession = Depends(get_db),
):
    # Build query with offset/limit
    offset = (page - 1) * per_page
    query = select(Widget).where(Widget.is_deleted == False)
    # ... add sorting, filtering
    query = query.offset(offset).limit(per_page)
    # ... execute and return with pagination metadata
```

Frontend passes pagination params:

```typescript
const { data } = useWidgets({ page: 1, per_page: 20, sort: 'created_at', order: 'desc' })
```

### Search Pattern (pg_trgm)

The backend uses PostgreSQL `pg_trgm` for fuzzy search:

```python
from sqlalchemy import func

if search:
    query = query.where(
        func.similarity(Participant.code, search) > 0.3
    ).order_by(func.similarity(Participant.code, search).desc())
```

Frontend sends `?search=term`:

```typescript
const { data } = useParticipants({ search: debouncedSearchTerm })
```

### Auth Guard Pattern

**Backend** -- use `require_role` dependency:

```python
@router.delete("/{id}")
async def delete_widget(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(UserRole.SUPER_ADMIN)),
):
    ...
```

**Frontend** -- use `<RoleGuard>` component (use BHARAT role strings):

```tsx
<RoleGuard roles={['super_admin', 'lii_pi_researcher']}>
  <AdminOnlyPage />
</RoleGuard>
```

### Form Pattern (react-hook-form + zod)

```typescript
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const schema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  description: z.string().optional(),
})

type FormData = z.infer<typeof schema>

function WidgetForm() {
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })
  const mutation = useCreateWidget()

  const onSubmit = (data: FormData) => {
    mutation.mutate(data)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Input {...register('name')} error={errors.name?.message} />
      <Button type="submit" loading={mutation.isPending}>Create</Button>
    </form>
  )
}
```

### Chart Pattern (Plotly + ChartCard)

```tsx
import { ChartCard } from '@/components/ui/chart-card'
import { chartColors } from '@/lib/chart-theme'

function EnrollmentChart({ data }) {
  return (
    <ChartCard title="Enrollment by Site">
      <Plot
        data={[{
          type: 'bar',
          x: data.map(d => d.site),
          y: data.map(d => d.count),
          marker: { color: chartColors.primary },
        }]}
        layout={{
          xaxis: { title: 'Site' },
          yaxis: { title: 'Participants' },
        }}
      />
    </ChartCard>
  )
}
```

### API Response Envelope

All backend responses follow this structure:

```python
# Success
return {"success": True, "data": {...}}

# Paginated success
return {
    "success": True,
    "data": [...],
    "pagination": {"page": 1, "per_page": 20, "total": 150, "pages": 8}
}

# Errors are handled by error_handlers.py automatically
```

---

## Development Commands

### Backend

```bash
cd backend

# Install with dev dependencies
pip install -e ".[dev]"

# Start development server (auto-reload)
uvicorn app.main:app --reload --port 8000

# Database migrations
alembic upgrade head                         # Apply all migrations
alembic revision --autogenerate -m "desc"    # Generate from model changes
alembic downgrade -1                         # Rollback one step
alembic current                              # Show current revision
alembic history                              # Show migration history

# Linting and formatting
ruff check app/                              # Lint
ruff check app/ --fix                        # Auto-fix lint issues
ruff format app/                             # Format code

# Type checking
mypy app/

# Tests
pytest                                       # Run all tests
pytest -x                                    # Stop on first failure
pytest --cov=app                             # With coverage
```

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Development server (hot reload on http://localhost:3000)
npm run dev

# Production build
npm run build

# Lint
npm run lint

# Type check (via tsc)
npx tsc --noEmit
```

### Docker

```bash
# Start all services (development)
docker compose up -d

# Start all services (production)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# View running services
docker compose ps

# View logs (follow)
docker compose logs -f api
docker compose logs -f celery-worker

# Rebuild a single service
docker compose up -d --build api

# Run a one-off command in the API container
docker compose exec api alembic upgrade head
docker compose exec api python -m app.seed

# Access the database
docker compose exec postgres psql -U liims -d liims

# Access Redis CLI
docker compose exec redis redis-cli

# Stop all services
docker compose down

# Stop and remove volumes (WARNING: deletes all data)
docker compose down -v
```

---

## Debugging Tips

### Backend

1. **Enable debug mode**: Set `DEBUG=true` in `.env`. This enables:
   - Verbose SQL query logging (SQLAlchemy echo)
   - Detailed error messages in API responses (including stack traces)
   - HSTS disabled

2. **Check API docs**: Visit `http://localhost:8000/api/docs` for interactive Swagger UI. Test endpoints directly.

3. **Database inspection**: Connect directly:
   ```bash
   docker compose exec postgres psql -U liims -d liims
   \dt                         # List tables
   \d participants             # Describe table
   SELECT count(*) FROM participants WHERE is_deleted = false;
   ```

4. **Celery task debugging**: Check worker logs:
   ```bash
   docker compose logs -f celery-worker
   ```

5. **Request tracing**: Every response includes an `X-Request-ID` header. Search logs for this ID to trace a request through the system.

### Frontend

1. **React Query DevTools**: Install the browser extension to inspect query cache, refetch states, and mutations.

2. **Network tab**: Check the browser's Network tab for API requests. The axios interceptor adds `Authorization: Bearer <token>` to every request.

3. **Auth debugging**: Check `localStorage` for `access_token`. If the token is missing or expired, the user will be redirected to `/login`.

4. **Build verification**: After building, check the assets:
   ```bash
   docker compose exec frontend ls /usr/share/nginx/html/assets/
   ```

5. **Vite proxy**: In development, Vite's dev server proxies `/api` requests. Make sure the backend is running on port 8000.

### Common Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| CORS error in browser | `CORS_ORIGINS` does not include the frontend URL | Add the frontend URL to `CORS_ORIGINS` in `.env` |
| 401 on every request | Token expired or revoked | Log out and log in again |
| 403 on an endpoint | User role not in `require_role()` list | Check the user's role in the admin panel |
| Blank page after deploy | Frontend build failed or Nginx not serving | Check `docker compose logs frontend` |
| Migration conflict | Two migrations with same parent | `alembic merge heads` |
| Celery tasks not executing | Worker not running or Redis down | `docker compose ps celery-worker` and `docker compose logs redis` |

---

## Environment Variables Reference

Complete reference of all environment variables. See also `.env.example`.

| Variable | Type | Default | Container | Description |
|----------|------|---------|-----------|-------------|
| `POSTGRES_PASSWORD` | string | `password` | postgres | PostgreSQL user password |
| `SECRET_KEY` | string | `change-me-in-production` | api, celery | JWT signing key. Must change for production. |
| `DEBUG` | bool | `false` | api | Debug mode |
| `FRONTEND_PORT` | int | `80` | frontend | Host port mapping |
| `CORS_ORIGINS` | JSON array | `["http://localhost"]` | api | Allowed CORS origins |
| `JWT_EXPIRY_HOURS` | int | `24` | api | JWT token lifetime |
| `BCRYPT_ROUNDS` | int | `12` | api | bcrypt cost factor |
| `DATABASE_URL` | string | (auto-constructed) | api, celery | PostgreSQL connection URL (asyncpg) |
| `REDIS_URL` | string | `redis://redis:6379` | api | Redis connection URL |
| `CELERY_BROKER_URL` | string | `redis://redis:6379/0` | celery | Celery broker URL |
| `CELERY_RESULT_BACKEND` | string | `redis://redis:6379/1` | celery | Celery result backend URL |
| `ODK_CENTRAL_URL` | string | -- | api, celery | ODK Central server URL |
| `ODK_CENTRAL_EMAIL` | string | -- | api, celery | ODK Central email |
| `ODK_CENTRAL_PASSWORD` | string | -- | api, celery | ODK Central password |
| `ODK_PROJECT_ID` | int | `1` | api, celery | ODK project ID |
| `ODK_FORM_ID` | string | `participant_id` | api, celery | ODK form ID |
| `ODK_SYNC_INTERVAL_MINUTES` | int | `60` | api, celery-beat | ODK sync frequency |
| `SMTP_HOST` | string | -- | api, celery | SMTP server hostname |
| `SMTP_PORT` | int | `587` | api, celery | SMTP port |
| `SMTP_USER` | string | -- | api, celery | SMTP username |
| `SMTP_PASSWORD` | string | -- | api, celery | SMTP password |
| `SMTP_FROM_NAME` | string | `LIIMS Alerts` | api, celery | Email sender display name |
| `SMTP_USE_TLS` | bool | `true` | api, celery | Use TLS for SMTP |
| `NAS_MOUNT_PATH` | string | `/mnt/nas` | api, celery | NAS mount point on host |
| `FILE_STORE_PATH` | string | `/data/file_store` | api, celery | Internal file store path |
| `FILE_STORE_MAX_SIZE_MB` | int | `100` | api | Max upload file size (MB) |
| `DASHBOARD_REFRESH_INTERVAL_MINUTES` | int | `15` | api, celery-beat | Dashboard cache refresh |
