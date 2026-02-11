import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import api_router
from app.config import settings
from app.core.error_handlers import register_error_handlers
from app.core.middleware import RequestIDMiddleware, SecurityHeadersMiddleware

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # C-02: Refuse to start with the default secret key in non-debug mode
    if not settings.DEBUG and settings.SECRET_KEY == "change-me-in-production":
        raise RuntimeError(
            "SECRET_KEY is still the default value. "
            "Set a strong SECRET_KEY env var before running in production."
        )
    yield
    # Shutdown: cleanup connections
    from app.database import engine

    await engine.dispose()


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

# --- Middleware (outermost first) ---

# Security headers on every response
app.add_middleware(SecurityHeadersMiddleware, enable_hsts=not settings.DEBUG)

# Request ID injection
app.add_middleware(RequestIDMiddleware)

# CORS - tighten in production via CORS_ORIGINS env var
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
)

# --- Error handlers ---
register_error_handlers(app)

# --- Routes ---
app.include_router(api_router)


@app.get("/api/health")
async def health_check():
    """Deep health check: verifies DB and Redis connectivity."""
    import time

    checks: dict = {"version": settings.APP_VERSION}
    healthy = True

    # Database check
    start = time.monotonic()
    try:
        from sqlalchemy import text

        from app.database import async_session_factory

        async with async_session_factory() as session:
            await session.execute(text("SELECT 1"))
        checks["database"] = {"status": "ok", "latency_ms": round((time.monotonic() - start) * 1000, 1)}
    except Exception as exc:
        healthy = False
        checks["database"] = {"status": "error", "detail": str(exc)[:200]}

    # Redis check
    start = time.monotonic()
    try:
        import redis.asyncio as aioredis

        r = aioredis.from_url(settings.REDIS_URL, socket_connect_timeout=3)
        await r.ping()
        await r.aclose()
        checks["redis"] = {"status": "ok", "latency_ms": round((time.monotonic() - start) * 1000, 1)}
    except Exception as exc:
        healthy = False
        checks["redis"] = {"status": "error", "detail": str(exc)[:200]}

    # Celery check (lightweight -- just verify broker is reachable)
    checks["celery_broker"] = checks.get("redis", {}).get("status", "unknown")

    checks["status"] = "healthy" if healthy else "degraded"

    from fastapi.responses import JSONResponse

    status_code = 200 if healthy else 503
    return JSONResponse(content=checks, status_code=status_code)
