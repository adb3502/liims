# Backend - LIIMS API

## Stack
- Python 3.11+, FastAPI, async SQLAlchemy 2.0, Pydantic v2
- PostgreSQL 15+ via asyncpg
- Celery + Redis for background tasks
- Alembic for migrations
- WeasyPrint for PDF generation

## Module Layout

- `app/config.py` - Pydantic Settings, all config from env vars
- `app/database.py` - Async engine, session factory, Base
- `app/main.py` - FastAPI app with CORS and lifespan
- `app/celery_app.py` - Celery instance with beat schedule
- `app/models/` - SQLAlchemy 2.0 mapped classes (one file per domain)
- `app/schemas/` - Pydantic request/response schemas
- `app/api/v1/` - Route handlers grouped by domain
- `app/services/` - Business logic (one file per domain)
- `app/core/` - Auth (JWT), security, dependencies, RBAC middleware
- `app/tasks/` - Celery tasks (dashboard, odk sync, file verification, backup)

## Patterns

- Use `async def` for all route handlers and DB operations
- Dependency injection via FastAPI's `Depends(get_db)`
- SQLAlchemy 2.0 style: `select()`, `Mapped[]`, `mapped_column()`
- All models inherit from `Base` in `app/database.py`
- Soft delete: filter `is_deleted == False` in all queries by default
- Pagination: `?page=1&per_page=20`, sort: `?sort=field&order=desc`
- Search: `?search=term` using pg_trgm similarity
- UUID PKs everywhere: `Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)`

## Running

```bash
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000
alembic upgrade head
alembic revision --autogenerate -m "description"
```
