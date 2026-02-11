# Phase 1 Audit Report

**Auditor:** Devil's Advocate Auditor
**Date:** 2026-02-12
**Scope:** All Phase 1 (Foundation) code -- backend, frontend, infrastructure
**Files reviewed:** 30+

---

## Critical Issues

> MUST FIX before any deployment. These are security vulnerabilities, data-loss risks, or bugs that will cause runtime failures.

### C-01: CORS Wildcard + Credentials = Browser-Rejected or Insecure

**File:** `backend/app/main.py`
**Lines:** CORS middleware configuration

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    ...
)
```

`allow_origins=["*"]` with `allow_credentials=True` is explicitly forbidden by the CORS specification. Modern browsers will **reject** credentialed requests when the server responds with `Access-Control-Allow-Origin: *`. This means cookies, Authorization headers, and client certificates will silently fail in production.

**Fix:** Replace `"*"` with a list of explicit origins from config, e.g. `settings.CORS_ORIGINS.split(",")`.

---

### C-02: Default SECRET_KEY Ships Insecure

**File:** `backend/app/config.py`

```python
SECRET_KEY: str = "change-me-in-production"
```

If someone deploys without setting the env var, every JWT is signed with a publicly-known key. An attacker can forge tokens for any user, including `super_admin`.

**Fix:** Remove the default value entirely so the app crashes on startup if `SECRET_KEY` is not set. Alternatively, add a startup check that raises `ValueError` if the value is the placeholder.

---

### C-03: Session Revocation Does Not Work

**File:** `backend/app/core/deps.py` -- `get_current_user()`

The function decodes the JWT and queries the `user` table but **never checks the `user_session` table**. The `AuthService` carefully creates, stores (hashed), and revokes sessions -- but `get_current_user` bypasses all of it. This means:

- `POST /auth/logout` revokes the session row, but the token **still works** until JWT expiry.
- `POST /auth/change-password` revokes all other sessions, but those tokens **still work**.
- Admins cannot force-revoke a compromised user's access.

**Fix:** After decoding the JWT, extract the `session_id` claim (or the raw token hash), and verify a matching active session exists in `user_session`. If not, raise 401.

---

### C-04: Route Ordering Bug -- Discard Requests Endpoint is Unreachable

**File:** `backend/app/api/v1/samples.py`

```python
@router.get("/{sample_id}", ...)
async def get_sample(sample_id: uuid.UUID, ...): ...

# ... later in the file ...

@router.get("/discard-requests", ...)
async def list_pending_discards(...): ...
```

FastAPI matches routes in declaration order. `GET /samples/discard-requests` will be caught by `GET /samples/{sample_id}` first, and FastAPI will attempt to parse `"discard-requests"` as a `uuid.UUID`, which will fail with a 422 validation error.

**Fix:** Move the `/discard-requests` route **above** the `/{sample_id}` route, or use a prefix like `/samples/actions/discard-requests`.

---

### C-05: XSS in Email Templates

**File:** `backend/app/core/email.py` -- `render_notification_email()`

```python
def render_notification_email(title: str, message: str, ...) -> str:
    return f"""...
    <h1 style="...">{title}</h1>
    ...
    <p style="...">{message}</p>
    ..."""
```

`title` and `message` are user/system-generated strings interpolated directly into HTML without escaping. If a notification title or message contains `<script>` or malicious HTML (e.g., from a crafted participant name that propagates to a notification), it will be rendered in the recipient's email client. While most email clients strip `<script>`, other vectors like `<img onerror=...>` or CSS injection may work.

**Fix:** Use `html.escape()` on all interpolated values, or use a proper templating engine (Jinja2) with auto-escaping.

---

### C-06: Arbitrary Column Access via Sort Parameter

**File:** `backend/app/services/participant.py` -- `list_participants()`

```python
sort_col = getattr(Participant, sort, Participant.created_at)
```

The `sort` parameter comes directly from the query string. `getattr(Participant, sort)` can access **any** attribute on the model class, including relationships, hybrid properties, or internal SQLAlchemy attributes. While it defaults to `created_at` if the attribute doesn't exist, a valid but sensitive column (e.g., `is_deleted`) could be used to probe data.

The same pattern exists in `backend/app/services/sample.py`.

**Fix:** Validate `sort` against an explicit allowlist of sortable column names:
```python
ALLOWED_SORTS = {"created_at", "participant_code", "enrollment_date", ...}
sort_col = getattr(Participant, sort) if sort in ALLOWED_SORTS else Participant.created_at
```

---

### C-07: `useDebounce` Hook Uses `useMemo` Instead of `useEffect` -- Cleanup Never Runs

**Files:**
- `frontend/src/features/participants/ParticipantListPage.tsx` (lines 81-88)
- `frontend/src/features/samples/SampleListPage.tsx` (lines 81-88)

```tsx
function useDebounce(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value)
  useMemo(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)  // This return value is IGNORED by useMemo
  }, [value, delay])
  return debounced
}
```

`useMemo` does **not** call a cleanup function. The `return () => clearTimeout(timer)` is the memoized value, not a cleanup. This means:
1. Every keystroke creates a new `setTimeout` that **never gets cleared**.
2. Multiple timers stack up and fire sequentially, causing unnecessary re-renders and API calls.
3. The debounce behavior is broken -- it acts more like a delayed burst than a debounce.

**Fix:** Replace `useMemo` with `useEffect`:
```tsx
useEffect(() => {
  const timer = setTimeout(() => setDebounced(value), delay)
  return () => clearTimeout(timer)
}, [value, delay])
```

---

## Important Issues

> SHOULD FIX. Functional bugs, missing validation, performance problems, or security weaknesses that aren't immediately exploitable but will cause problems.

### I-01: Auth Store `/me` Response Shape Mismatch

**File:** `frontend/src/stores/auth.ts` -- `checkAuth()`

```typescript
const response = await api.get('/auth/me')
set({ user: response.data.data.user, ... })
```

But the backend `GET /auth/me` endpoint returns:
```python
return {"success": True, "data": user_schema}
```

So `response.data` is `{ success: true, data: { id, email, full_name, ... } }`. The store accesses `response.data.data.user`, but there is no `.user` property -- the user object IS the `data`. This means `checkAuth()` sets `user` to `undefined`, and the user appears unauthenticated on page refresh even with a valid token.

**Fix:** Change to `set({ user: response.data.data, ... })`.

---

### I-02: Synchronous Redis in Async Context

**File:** `backend/app/services/system_setting.py`

```python
import redis
self._redis = redis.Redis(host=settings.REDIS_HOST, ...)
cached = self._redis.get(cache_key)
```

This uses the **synchronous** `redis.Redis` client inside async route handlers. Every Redis call blocks the event loop, which means all other concurrent requests are stalled until Redis responds. Under load, this will cause cascading latency.

Additionally, a **new Redis connection** is created for every `SystemSettingService` instantiation (which happens per-request via dependency injection).

**Fix:** Use `redis.asyncio.Redis` (or `aioredis`) with a shared connection pool. Create the pool once at app startup and inject it.

---

### I-03: No Rate Limiting on Login Endpoint

**File:** `backend/app/api/v1/auth.py`

The `POST /auth/login` endpoint has no rate limiting. An attacker can attempt unlimited password guesses. While bcrypt is slow by design, this still enables:
- Credential stuffing attacks using leaked password databases
- Targeted brute force against known email addresses
- Resource exhaustion (bcrypt is CPU-intensive; flooding login requests starves the server)

**Fix:** Add rate limiting middleware (e.g., `slowapi` or a custom dependency) -- something like 5 attempts per email per minute, 20 per IP per minute.

---

### I-04: Missing `stool_kit` in ALIQUOT_RULES

**File:** `backend/app/services/sample.py`

```python
ALIQUOT_RULES: dict[str, list[tuple[str, int | None]]] = {
    "plasma": [...],
    "epigenetics": [...],
    "extra_blood": [...],
    ...
}
```

`stool_kit` is a valid `SampleType` (defined in enums) but has no entry in `ALIQUOT_RULES`. When a stool kit sample calls `generate_aliquots()`, the lookup `ALIQUOT_RULES.get(sample.sample_type, [])` returns `[]`, silently producing no aliquots. If stool kits are not supposed to have aliquots, this should be documented. If they should, this is a data-loss bug.

**Fix:** Either add stool_kit rules, or add a comment/validation explaining which sample types have aliquots and which don't.

---

### I-05: `notify_role` Creates N Individual Notifications

**File:** `backend/app/services/notification.py`

```python
async def notify_role(self, role: UserRole, ...):
    users = (await self.db.execute(
        select(User).where(User.role == role, User.is_active == True)
    )).scalars().all()
    for user in users:
        notif = Notification(recipient_id=user.id, ...)
        self.db.add(notif)
```

This creates one notification row per user with that role. For 50 lab technicians, that is 50 identical rows. This is:
- Wasteful in storage
- Slow (N inserts in a loop, no bulk insert)
- Inconsistent with the `Notification` model which has a `recipient_role` field designed for role-based notifications

**Fix:** Create a single notification with `recipient_role=role` and `recipient_id=None`, then query notifications for a user by matching either `recipient_id` or `recipient_role`.

---

### I-06: `is_deleted` Exposed Inconsistently

**File:** `backend/app/schemas/participant.py` -- `ParticipantRead`

The `ParticipantRead` Pydantic schema does not include `is_deleted`, but the frontend `Participant` TypeScript interface (`frontend/src/types/index.ts:157`) includes `is_deleted: boolean`. This means:
- The backend will strip `is_deleted` from responses
- The frontend type expects it and may reference it (causing `undefined` at runtime)
- Soft-deleted participants are already filtered out in queries, so `is_deleted` is always `False` in responses -- but the type mismatch is a maintenance trap

**Fix:** Either add `is_deleted` to `ParticipantRead` or remove it from the frontend type. Be consistent.

---

### I-07: Password Validation Too Weak

**File:** `backend/app/schemas/auth.py`

```python
class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)
```

The only password requirement is minimum 8 characters. `"aaaaaaaa"` and `"password"` both pass. For a system managing sensitive health research data (with HIPAA-adjacent requirements), this is insufficient.

The `LoginRequest` schema has `password: str = Field(min_length=1)`, which is fine for login, but the create/change flows need stronger validation.

**Fix:** Add a Pydantic validator that enforces at least one uppercase, one lowercase, one digit, and one special character. Or use a library like `zxcvbn` for strength scoring.

---

### I-08: No Nginx Security Headers

**File:** `nginx.conf`

The Nginx config proxies requests but sets zero security headers:
- No `Content-Security-Policy`
- No `X-Frame-Options`
- No `X-Content-Type-Options`
- No `Strict-Transport-Security`
- No `Referrer-Policy`
- No `Permissions-Policy`

SSL is also commented out, so there's no HTTPS in the shipped config.

**Fix:** Add standard security headers:
```nginx
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Content-Security-Policy "default-src 'self'; ..." always;
```

---

### I-09: JWT Stored in localStorage -- Vulnerable to XSS

**File:** `frontend/src/stores/auth.ts` and `frontend/src/lib/api.ts`

```typescript
localStorage.setItem('access_token', data.access_token)
// ...
const token = localStorage.getItem('access_token')
```

Storing JWTs in `localStorage` means any XSS vulnerability (including from third-party scripts, browser extensions, or the email XSS in C-05) gives an attacker the ability to steal the token and impersonate the user indefinitely (until token expiry).

**Fix:** Use `httpOnly` cookies set by the backend instead of localStorage. This makes the token inaccessible to JavaScript. The CORS and CSRF configuration would need updating accordingly.

---

### I-10: Token Refresh Creates Race Condition

**File:** `frontend/src/lib/api.ts`

```typescript
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true
      const { data } = await api.post('/auth/refresh')
      // ...
    }
  }
)
```

If multiple requests fail with 401 simultaneously (common when the token expires while several API calls are in-flight), each one will independently call `/auth/refresh`. This causes:
- Multiple refresh requests hitting the server
- Potential token rotation conflicts (if refresh tokens are single-use)
- Race conditions where one refresh succeeds but another overwrites with a stale/failed result

**Fix:** Implement a refresh lock -- when the first 401 triggers a refresh, queue subsequent 401s and resolve them all once the single refresh completes.

---

### I-11: No Database Indexes for Common Query Patterns

**File:** `backend/app/models/sample.py`, `backend/app/models/participant.py`

The `Sample` model has an index on `sample_code` and a composite index on `(participant_id, sample_type)`, but several common query patterns lack indexes:
- `Sample.status` (filtered on every list query)
- `Sample.collection_site_id` (filtered for site-based views)
- `Sample.wave` (filtered for wave-based analysis)
- `Notification.recipient_id` + `Notification.is_read` (queried on every page load)
- `AuditLog.entity_type` + `AuditLog.entity_id` (queried for entity history)

**Fix:** Add indexes for these frequently-filtered columns. At minimum: `Sample.status`, `Notification(recipient_id, is_read)`, `AuditLog(entity_type, entity_id)`.

---

### I-12: Consent Withdrawal Does Not Cascade to Samples

**File:** `backend/app/services/participant.py` -- `withdraw_consent()`

When consent is withdrawn, the service sets `withdrawal_date` and `withdrawal_reason` on the consent record but does **nothing** to the participant's samples. For a health research system, consent withdrawal typically requires:
- Flagging or quarantining associated samples
- Preventing further processing/analysis
- Potentially triggering a discard workflow
- Creating an audit trail

The `NotificationType` enum includes `consent_withdrawal`, suggesting this was planned but not implemented.

**Fix:** When `dbs_storage` consent is withdrawn, trigger sample quarantine (set status to `pending_discard`), create notifications for lab managers, and log the cascade in audit.

---

## Suggestions

> NICE TO HAVE. Code quality, performance optimizations, developer experience improvements.

### S-01: Duplicate Label Constants

`SAMPLE_TYPE_LABELS` and `SAMPLE_STATUS_LABELS` are defined in:
- `frontend/src/types/index.ts`
- `frontend/src/features/samples/SampleListPage.tsx`
- `frontend/src/features/samples/SampleDetailPage.tsx`

Any change to sample types requires updating 3+ files. Extract these to a single `@/constants/samples.ts` module.

---

### S-02: Missing Error Boundary

The frontend has no React Error Boundary. If any component throws during render (e.g., accessing a property on `undefined`), the entire app crashes to a white screen. Add a top-level `ErrorBoundary` component wrapping the router.

---

### S-03: No Request/Response Logging

**File:** `backend/app/core/middleware.py`

The `RequestIDMiddleware` adds a request ID header but doesn't log requests or responses. For a lab management system, having structured request logs (method, path, status, duration, user_id) is essential for debugging and compliance.

---

### S-04: `PlaceholderPage` Should Show Route Info

**File:** `frontend/src/router.tsx`

The `PlaceholderPage` component only shows a static "under development" message. It would be more helpful during development to display the current route path, so developers and testers can verify which placeholder they've hit.

---

### S-05: Docker Compose Missing Restart Policies

**File:** `docker-compose.yml`

Only `nginx` and `api` have `restart: unless-stopped`. The `celery-worker`, `celery-beat`, `postgres`, and `redis` services have no restart policy. If any of these crash, they stay down until manual intervention.

**Fix:** Add `restart: unless-stopped` to all services.

---

### S-06: No Health Check Endpoint

**File:** `backend/app/main.py`

The API has no `/health` or `/readiness` endpoint. Docker healthchecks, load balancers, and monitoring tools need a lightweight endpoint that verifies:
- The app is running
- Database connectivity
- Redis connectivity

---

### S-07: Frontend Date Formatting Is Locale-Dependent

**Files:** `SampleListPage.tsx`, `SampleDetailPage.tsx`, `ParticipantListPage.tsx`

```tsx
new Date(s.collection_datetime).toLocaleDateString()
```

`toLocaleDateString()` with no arguments uses the browser's locale, producing inconsistent date formats across users. For a scientific/lab system, dates should use a consistent format (e.g., ISO 8601 or `dd MMM yyyy`).

---

### S-08: No TypeScript Strict Mode Verification

**File:** `frontend/tsconfig.json` (not reviewed but relevant)

The frontend should have `"strict": true` in `tsconfig.json` to catch null/undefined issues at compile time. Several patterns in the codebase (optional chaining on potentially-required fields) suggest strict mode may not be fully enforced.

---

### S-09: Sidebar Navigation Has Hardcoded Role Checks

**File:** `frontend/src/components/layout/Sidebar.tsx`

The sidebar filters menu items based on roles using inline arrays. If role requirements change, both the router's `RoleGuard` and the sidebar's `roles` arrays must be updated in sync. Consider extracting route-role mappings to a shared config.

---

### S-10: Database Pool Size May Be Insufficient

**File:** `backend/app/database.py`

```python
engine = create_async_engine(
    settings.DATABASE_URL,
    pool_size=20,
    max_overflow=10,
)
```

With Celery workers sharing the same database and potentially many concurrent API requests, a pool of 20+10=30 connections may be tight. Monitor connection usage in production and consider configuring pool size via environment variables.

---

## Summary

### By Severity

| Severity | Count | Description |
|----------|-------|-------------|
| **Critical** | 7 | Security vulnerabilities and runtime bugs that will cause failures |
| **Important** | 12 | Functional bugs, missing validation, and security weaknesses |
| **Suggestion** | 10 | Code quality and developer experience improvements |

### Top Priorities (Fix Immediately)

1. **C-03: Session revocation bypass** -- Logout and password change don't actually revoke access
2. **C-04: Discard requests endpoint unreachable** -- Route ordering bug breaks the discard workflow entirely
3. **C-01: CORS misconfiguration** -- Will break credentialed requests in production browsers
4. **C-02: Default SECRET_KEY** -- Deployment without env var = complete auth bypass
5. **C-07: Broken useDebounce** -- Memory leak and incorrect debounce behavior in two list pages
6. **I-01: Auth store /me mismatch** -- Users can't stay logged in across page refreshes
7. **C-05: XSS in emails** -- Unsanitized HTML interpolation

### Architecture Assessment

The Phase 1 foundation is **well-structured overall**. The codebase demonstrates:
- Clean separation of concerns (services, routes, models, schemas)
- Proper use of SQLAlchemy 2.0 patterns
- Good audit logging infrastructure
- Thoughtful sample status state machine

However, the critical issues around session validation (C-03) and route ordering (C-04) indicate that the authentication and routing layers need a focused review pass. The frontend auth store bug (I-01) means the login flow is likely broken for returning users, which would be caught immediately in manual testing.

The security posture needs hardening before any deployment: CORS, secret management, rate limiting, security headers, and token storage all need attention. These are typical for a rapid prototyping phase but must be resolved before any user data enters the system.
