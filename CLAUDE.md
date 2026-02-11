# LIIMS - Longevity India Information Management System

## Project Context

LIIMS is a self-hosted LIMS for the BHARAT Study (Biomarkers of Healthy Aging, Resilience, Adversity, and Transitions) at IISc Bangalore. It manages participant enrollment, sample lifecycle, storage inventory, field operations, partner lab integrations, and instrument workflows for a cross-sectional multi-omics aging cohort study.

Full specification: `SPEC.md`

## Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.11+, FastAPI, async SQLAlchemy 2.0, Pydantic v2 |
| Database | PostgreSQL 15+ with asyncpg driver |
| Task Queue | Celery with Redis broker |
| Frontend | React 19, TypeScript, Vite, TanStack Query, Tailwind CSS v4, shadcn/ui |
| State | Zustand (client), react-hook-form + zod (forms) |
| PDF | WeasyPrint |
| Deployment | Docker Compose, Nginx reverse proxy |

## Project Structure

```
lims/
├── backend/           # FastAPI application
│   ├── app/
│   │   ├── api/v1/    # Route handlers
│   │   ├── models/    # SQLAlchemy models
│   │   ├── schemas/   # Pydantic schemas
│   │   ├── services/  # Business logic
│   │   ├── core/      # Auth, security, deps
│   │   ├── tasks/     # Celery tasks
│   │   ├── config.py  # Settings from env vars
│   │   ├── database.py # Async engine + session
│   │   ├── celery_app.py
│   │   └── main.py    # FastAPI app factory
│   ├── alembic/       # Database migrations
│   └── pyproject.toml
├── frontend/          # React application
│   ├── src/
│   │   ├── components/ui/  # shadcn/ui components
│   │   ├── lib/       # Utils, API client
│   │   ├── pages/     # Route pages
│   │   ├── stores/    # Zustand stores
│   │   └── hooks/     # Custom hooks
│   └── package.json
├── docker-compose.yml
├── nginx.conf
├── .env.example
└── SPEC.md
```

## Dev Commands

```bash
# Start all services
docker compose up -d

# Backend only (local dev)
cd backend && pip install -e ".[dev]" && uvicorn app.main:app --reload --port 8000

# Frontend only (local dev)
cd frontend && npm install && npm run dev

# Run migrations
cd backend && alembic upgrade head

# Create new migration
cd backend && alembic revision --autogenerate -m "description"

# Celery worker
cd backend && celery -A app.celery_app:celery worker -l info

# Celery beat
cd backend && celery -A app.celery_app:celery beat -l info
```

## Key Conventions

- **Frontend agents MUST use the `/frontend-design` skill (via Skill tool) before building any page or component** — no exceptions
- All database tables use UUID primary keys and soft deletes (`is_deleted`, `deleted_at`)
- All entities carry `created_at`, `updated_at` timestamps with timezone
- Core entities carry a `wave` column (default 1) for multi-wave support
- API base URL: `/api/v1` with JWT Bearer auth
- API responses: `{ success: bool, data: ..., meta: { page, per_page, total } }`
- No raw data exports; operational PDFs and worklists only
- Fuzzy search via PostgreSQL `pg_trgm` extension
- Audit logging on all data modifications (immutable append-only)
