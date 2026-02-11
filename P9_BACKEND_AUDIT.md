# P9 Backend Code Audit

**Auditor**: backend-auditor
**Date**: 2026-02-12
**Scope**: All backend models, services, API routes, core modules, config, and infrastructure files.

---

## CRITICAL Issues

### C-01: `UserSession.is_active` column does not exist -- auth bypass risk

**File**: `backend/app/core/deps.py:53`

The `get_current_user` dependency queries `UserSession.is_active == True`, but the `UserSession` model (`backend/app/models/user.py:38-63`) has no `is_active` column. It only has `revoked_at` and `expires_at`.

This will cause a **runtime error** (AttributeError or OperationalError for a missing column) on every authenticated request. If SQLAlchemy silently ignores it or if a migration added the column without the model definition, the check may not correctly validate session revocation.

**Fix**: Replace `UserSession.is_active == True` with the actual revocation and expiry checks:
```python
from datetime import datetime, timezone
now = datetime.now(timezone.utc)
session_result = await db.execute(
    select(UserSession.id).where(
        UserSession.token_hash == token_hash,
        UserSession.revoked_at.is_(None),
        UserSession.expires_at > now,
    )
)
```

---

### C-02: `AuditLog.created_at` referenced but column is `timestamp`

**File**: `backend/app/services/report.py:477-489`

The compliance report queries `AuditLog.created_at >= thirty_days_ago` (lines 477, 482, 488), but the `AuditLog` model (`backend/app/models/user.py:80`) defines the column as `timestamp`, not `created_at`. `AuditLog` inherits from `UUIDPrimaryKeyMixin` and `Base` directly -- it does NOT use `TimestampMixin`, so it has no `created_at` column.

This will cause a **runtime error** when generating the compliance report.

**Fix**: Change all three references from `AuditLog.created_at` to `AuditLog.timestamp`.

---

### C-03: `AuditLog` constructor called with `context=` but column is `additional_context`

**File**: `backend/app/services/user.py:184`

```python
self.db.add(AuditLog(
    ...
    context={"event": "admin_password_reset"},
))
```

The `AuditLog` model defines the JSONB column as `additional_context` (`backend/app/models/user.py:83`), not `context`. This will either silently be ignored by SQLAlchemy (losing the audit context) or raise an error.

**Also affected**: `backend/app/services/auth.py:160,182,195,231,305` -- the `AuthService.log_audit` method correctly uses `additional_context=context`, so those are fine. But `user.py:184` bypasses that helper.

**Fix**: Change `context=` to `additional_context=` at `user.py:184`.

---

### C-04: Sync service creates samples without `sample_code` or `status`

**File**: `backend/app/services/sync.py:261-272`

The `_apply_sample_register` method creates a `Sample` without setting the required `sample_code` or `status` fields. The `Sample` model requires `sample_code` (unique, not-nullable) and `status` (not-nullable enum). This will fail with a database constraint violation on every offline sample registration.

```python
sample = Sample(
    id=uuid.uuid4(),
    participant_id=uuid.UUID(participant_id),
    sample_type=payload.get("sample_type", "plasma"),
    # MISSING: sample_code
    # MISSING: status
    ...
)
```

**Fix**: Generate a sample_code (e.g., from participant_code + sample_type + counter) and set `status=SampleStatus.COLLECTED`.

---

### C-05: Sync service status update bypasses `VALID_TRANSITIONS` validation

**File**: `backend/app/services/sync.py:323-326`

The `_apply_sample_status_update` method directly assigns `sample.status = new_status` without validating the transition against `VALID_TRANSITIONS` from `SampleService`. This allows illegal status transitions (e.g., jumping from `COLLECTED` directly to `DISPOSED`), which could corrupt data integrity.

**Fix**: Import and check against `VALID_TRANSITIONS`:
```python
from app.services.sample import VALID_TRANSITIONS
if new_status not in VALID_TRANSITIONS.get(sample.status, []):
    return {"status": "skipped", "reason": "invalid_transition"}
```

---

### C-06: Settings endpoint has explicit `await db.commit()` inside request lifecycle

**File**: `backend/app/api/v1/settings.py:92`

```python
await db.commit()
```

The `get_db` dependency (`backend/app/database.py:25-34`) already commits on success and rolls back on failure. An explicit `db.commit()` here creates a **double commit** scenario which can cause issues:
- Partial data in the session might be committed prematurely
- On error after the explicit commit but before the dependency cleanup, data is committed but the error handler may not properly roll back

This is the ONLY route in the entire codebase with an explicit `db.commit()` -- all other routes rely on the dependency.

**Fix**: Remove `await db.commit()` from line 92.

---

## IMPORTANT Issues

### I-01: Report delete performs hard DELETE, not soft delete

**File**: `backend/app/api/v1/reports.py:204-207`

```python
await db.delete(report)
await db.flush()
```

All other entities use soft delete (`is_deleted = True`). The `ScheduledReport` deletion is a permanent hard delete with no audit log. This is inconsistent with the soft-delete pattern used everywhere else and loses data without a trail.

**Fix**: Either add `is_deleted`/`deleted_at` columns to `ScheduledReport` and do a soft delete, or at minimum add an audit log entry before deletion.

---

### I-02: `has_space` post-filtering breaks pagination totals

**File**: `backend/app/services/storage.py:288-301`

The `list_boxes` method applies `has_space` filtering AFTER the SQL query returns paginated results. The `total` count is computed from the SQL query which does NOT account for `has_space`, so the pagination metadata (total, total_pages) will be wrong when `has_space=True` is requested.

```python
if has_space is not None:
    # Post-filter by available space
    if has_space:
        items = [i for i in items if i["occupied_count"] < i["total_positions"]]
    else:
        items = [i for i in items if i["occupied_count"] >= i["total_positions"]]
```

**Fix**: Move the space check into the SQL query using a subquery for occupied count, or recompute the total after filtering.

---

### I-03: In-memory password reset tokens won't survive restarts / multi-worker

**File**: `backend/app/services/auth.py:24-26`

```python
_reset_tokens: dict[str, tuple[uuid.UUID, datetime]] = {}
```

Password reset tokens are stored in a module-level dict. In production with multiple Uvicorn workers (or Gunicorn workers), each worker has its own copy of this dict. A token generated by worker A cannot be validated by worker B. Additionally, all tokens are lost on restart.

**Fix**: Store reset tokens in Redis or the database. The codebase already has Redis configured.

---

### I-04: Query builder CSV export allows up to 50,000 rows -- potential DoS

**File**: `backend/app/services/query_builder.py:228-246`

The `export_csv` method fetches up to 50,000 rows and serializes them all in memory. For wide entities this could consume significant memory and tie up a database connection for an extended period.

The rate limiter (`20 requests/60s`) provides some protection, but a single request fetching 50K rows across many columns could still cause issues.

**Fix**: Add streaming CSV generation or reduce the limit to 10,000 rows. Consider background job export for large datasets.

---

### I-05: Report generation error handler leaks internal details

**File**: `backend/app/api/v1/reports.py:262-264`

```python
except Exception as e:
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail=f"Report generation failed: {str(e)}",
    )
```

This leaks the full exception message to the client, which could include database connection strings, file paths, or internal stack information. The global error handler in `error_handlers.py` is designed to prevent this, but this route-level handler bypasses it.

**Fix**: Return a generic error message:
```python
detail="Report generation failed. Please try again or contact support."
```

---

### I-06: In-memory rate limiter won't work across multiple workers

**File**: `backend/app/core/rate_limit.py:73-74`

```python
_counter = _SlidingWindowCounter()
```

Like the password reset tokens, the rate limiter uses a module-level singleton that is not shared across workers. In production with multiple Uvicorn/Gunicorn workers, rate limits are per-worker, meaning the effective limit is `max_calls * worker_count`.

**Fix**: Use Redis-based rate limiting for production deployments.

---

### I-07: Missing audit log for watch directory create/update

**File**: `backend/app/services/file_store.py:217-250`

The `WatchDirectoryService.create_watch_dir()` and `update_watch_dir()` methods do not create audit log entries, unlike most other create/update operations in the codebase. Since watch directories control which NAS paths are scanned, changes should be audited.

**Fix**: Add `AuditLog` entries in both methods.

---

### I-08: Missing pagination for discard requests listing

**File**: `backend/app/api/v1/samples.py:111-125`

The `list_discard_requests` endpoint returns ALL discard requests without pagination. If the system accumulates many discard requests over time, this could return an unbounded result set.

**Fix**: Add `page` and `per_page` query parameters with standard pagination.

---

### I-09: Rack list endpoint returns all racks without pagination

**File**: `backend/app/api/v1/storage.py:150-163`

The `list_racks_for_freezer` endpoint returns all racks for a freezer with `"meta": {"count": len(racks)}` instead of proper pagination. While freezers have limited racks, this is inconsistent with every other list endpoint.

---

### I-10: Seed file imports from `app.models.omics` which may not exist

**File**: `backend/app/seed.py:49`

```python
from app.models.omics import IccProcessing, OmicsResult, OmicsResultSet
```

The models directory (`backend/app/models/`) does not contain an `omics.py` file. The ICC and Omics models are likely defined in `instrument.py` or another file. This will cause an `ImportError` when running the seeder.

**Fix**: Update the import to point to the correct model file.

---

### I-11: Notification `mark_read` doesn't verify user owns the notification

**File**: `backend/app/api/v1/notifications.py:62-73`

The `mark_read` endpoint takes a `notification_id` and calls `svc.mark_read(notification_id, current_user.id)`. However, if the `mark_read` service method doesn't verify ownership, any authenticated user could mark any other user's notifications as read.

Need to verify the service method checks the notification belongs to the requesting user or their role.

---

### I-12: QR lookup endpoint has N+1 query pattern

**File**: `backend/app/api/v1/qr.py:109-115`

After loading the sample with `selectinload(Sample.participant)`, the code makes a separate query to resolve the `CollectionSite.name`:

```python
site_result = await db.execute(
    select(CollectionSite.name).where(
        CollectionSite.id == sample.participant.collection_site_id
    )
)
```

This could be resolved with an additional `selectinload` or `joinedload` on the participant's collection_site relationship.

---

### I-13: Missing `SampleStatusHistory` entry in sync status update

**File**: `backend/app/services/sync.py:323-336`

When updating a sample's status via offline sync, no `SampleStatusHistory` entry is created. The normal `SampleService.update_status` method creates a history entry. This means offline status changes won't appear in the sample's status timeline.

**Fix**: Add a `SampleStatusHistory` record when applying status updates from sync.

---

### I-14: Collection site update endpoint passes redundant kwargs

**File**: `backend/app/api/v1/collection_sites.py:98-103`

```python
update_kwargs = data.model_dump(exclude_unset=True)
if "participant_range_start" in update_kwargs:
    update_kwargs["participant_range_start"] = data.participant_range_start
if "participant_range_end" in update_kwargs:
    update_kwargs["participant_range_end"] = data.participant_range_end
```

The `if` blocks re-assign values that are already in `update_kwargs` from `model_dump(exclude_unset=True)`. This is dead code that does nothing.

---

### I-15: Missing `order` parameter validation in several list endpoints

**Files**: `backend/app/api/v1/participants.py:53`, `backend/app/api/v1/samples.py:61`, `backend/app/api/v1/field_events.py:51`

These endpoints accept `order: str = "desc"` without validation. While the service layer has sort column allowlists, an invalid `order` value (e.g., `order="; DROP TABLE"`) would be passed to `col.desc()` or `col.asc()` -- but since the service uses a ternary check (`if order == "desc"`), anything other than `"desc"` defaults to `asc()`, so this is NOT an injection vector. However, it should be validated for API correctness.

Other endpoints (instruments, icc, files, plates) correctly use `Query("desc", pattern="^(asc|desc)$")`.

**Fix**: Add `pattern="^(asc|desc)$"` to the `order` parameter in all affected endpoints.

---

## CODE QUALITY Issues

### Q-01: Duplicate `_paginate_meta` helper function defined in 5 files

**Files**:
- `backend/app/api/v1/instruments.py:66-72`
- `backend/app/api/v1/icc.py:33-39`
- `backend/app/api/v1/reports.py:42-48`
- `backend/app/api/v1/query_builder.py:63-69`
- `backend/app/api/v1/files.py:42-48`

The same pagination meta helper is copy-pasted across 5 route files. Other route files compute it inline with `math.ceil(total / per_page)`.

**Fix**: Extract to a shared utility (e.g., `app/core/pagination.py`).

---

### Q-02: Inconsistent use of `response_model=dict` vs no response model

**Files**: Multiple route files

Most endpoints use `response_model=dict`, but some endpoints omit it:
- `backend/app/api/v1/reports.py:54` (generate_report) -- returns `Response`
- `backend/app/api/v1/labels.py:25,57` -- returns `StreamingResponse`
- `backend/app/api/v1/qr.py:35` -- returns `Response`

While this is technically correct (streaming/binary responses don't need `response_model`), the label `/groups` endpoint (line 88) also omits `response_model=dict` while returning a dict -- inconsistent.

---

### Q-03: Unused import `secrets` in auth route

**File**: `backend/app/api/v1/auth.py:4`

```python
import secrets
```

This import is never used in the file.

---

### Q-04: Inline import in `samples.py` route handler

**File**: `backend/app/api/v1/samples.py:92-93`

```python
from app.models.participant import Participant
from sqlalchemy import select
```

Inline imports inside a route handler should be moved to the top of the file for consistency and to avoid repeated import overhead on each request.

---

### Q-05: `_STATIC_ENTITY_LIST` uses a global mutable with no thread safety

**File**: `backend/app/api/v1/query_builder.py:24-51`

```python
_STATIC_ENTITY_LIST: list[dict] | None = None

def _get_entity_list() -> list[dict]:
    global _STATIC_ENTITY_LIST
    if _STATIC_ENTITY_LIST is None:
        ...
        _STATIC_ENTITY_LIST = entities
    return _STATIC_ENTITY_LIST
```

This lazy initialization has a potential race condition on first access with concurrent requests. Since the data is static and immutable, this is low-risk, but could be improved with eager initialization or `functools.lru_cache`.

---

### Q-06: Celery timezone set to `Asia/Kolkata` with `enable_utc=True`

**File**: `backend/app/celery_app.py:15-16`

```python
timezone="Asia/Kolkata",
enable_utc=True,
```

When `enable_utc=True`, Celery internally converts and stores everything in UTC. Setting `timezone="Asia/Kolkata"` alongside means the display timezone is IST but storage is UTC. This is generally fine but could lead to confusion when reading beat schedule logs. Consider using `timezone="UTC"` for consistency with the rest of the codebase which uses UTC internally.

---

### Q-07: Health check creates a new Redis connection on every call

**File**: `backend/app/main.py:87-92`

```python
r = aioredis.from_url(settings.REDIS_URL, socket_connect_timeout=3)
await r.ping()
await r.aclose()
```

Each health check creates and destroys a Redis connection. Under load balancer health checks (every 10-30 seconds), this creates unnecessary churn. Consider reusing a connection pool.

---

### Q-08: No `per_page` upper bound on omics results endpoint

**File**: `backend/app/api/v1/instruments.py:397`

```python
per_page: int = Query(100, ge=1, le=1000),
```

The omics results endpoint allows up to 1000 results per page. While this is within the allowed bounds, it's significantly higher than the standard `le=100` used by all other endpoints. Given that omics results can have many columns, this could be expensive.

---

### Q-09: `labels.py` route handler catches generic `Exception` and hides details

**File**: `backend/app/api/v1/labels.py:41-45,73-77`

Both label generation endpoints catch bare `Exception` and return a generic 500 error. While this prevents information leakage (good), it also swallows the exception without logging it. Consider adding `logger.exception()` before raising.

---

### Q-10: `partner_results` endpoint uses higher `per_page` limit

**File**: `backend/app/api/v1/partner.py:322`

```python
per_page: int = Query(50, ge=1, le=200),
```

Partner results and canonical tests use `le=200` while most other endpoints use `le=100`. This inconsistency should be documented or standardized.

---

## Summary

| Category | Count |
|----------|-------|
| **Critical** | 6 |
| **Important** | 15 |
| **Code Quality** | 10 |
| **Total** | 31 |

### Critical Issues by Priority:
1. **C-01**: `UserSession.is_active` missing column -- breaks all authenticated requests
2. **C-02**: `AuditLog.created_at` vs `timestamp` -- breaks compliance reports
3. **C-03**: Wrong kwarg name in AuditLog -- loses audit data
4. **C-04**: Missing `sample_code`/`status` in sync -- breaks offline sample creation
5. **C-05**: Sync bypasses status validation -- data integrity risk
6. **C-06**: Double commit in settings -- transaction safety risk
