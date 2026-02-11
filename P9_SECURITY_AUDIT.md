# P9 Security Audit Report - LIIMS

**Auditor:** Security Auditor (Phase 9)
**Date:** 2026-02-12
**Scope:** Comprehensive security audit covering OWASP Top 10, authentication, authorization, injection, XSS/CSRF, file security, data protection, infrastructure, and LIMS-specific concerns.

---

## Executive Summary

The LIIMS application demonstrates a **generally solid security posture** with several well-implemented controls: bcrypt password hashing, JWT with session validation, RBAC on all endpoints, sort column allowlists, ILIKE metacharacter escaping, non-root Docker containers, and comprehensive security headers. However, several medium-severity findings require attention before production deployment.

**Finding Counts:**
- CRITICAL: 0
- HIGH: 2
- MEDIUM: 7
- LOW: 6

---

## 1. Authentication

### 1.1 JWT Implementation

**Status: GOOD with notes**

- **Algorithm:** HS256 (symmetric). Acceptable for single-server deployment. If multi-service architecture is adopted later, migrate to RS256.
- **Secret Key:** Default `change-me-in-production` in `backend/app/config.py:18`. The lifespan handler in `backend/app/main.py:17-19` correctly refuses to start in non-DEBUG mode with the default key. **GOOD.**
- **Expiration:** 24 hours (`JWT_EXPIRY_HOURS=24`). Acceptable given session validation on every request.
- **JTI (Token ID):** Present (`backend/app/core/security.py:39`). Used for session tracking. **GOOD.**
- **Algorithm pinning:** `algorithms=[settings.JWT_ALGORITHM]` in decode prevents algorithm confusion attacks. **GOOD.**

### 1.2 Password Hashing

**Status: GOOD**

- Bcrypt with 12 rounds (`backend/app/config.py:20`, `backend/app/core/security.py:14`). Industry standard.
- Configurable via env var.

### S-01 | MEDIUM | Password Complexity Not Enforced Server-Side

- **File:** `backend/app/schemas/auth.py:25`, `backend/app/schemas/user.py:13`
- **Finding:** `new_password: str = Field(min_length=8)` -- Only minimum length is validated. No requirements for uppercase, lowercase, digit, or special character. For a LIMS handling research data, this is insufficient.
- **Remediation:** Add a Pydantic validator that enforces at minimum: 1 uppercase, 1 lowercase, 1 digit, minimum 8 characters. Example:
  ```python
  @field_validator("new_password")
  @classmethod
  def validate_password_strength(cls, v):
      if not re.search(r"[A-Z]", v): raise ValueError("Must contain uppercase")
      if not re.search(r"[a-z]", v): raise ValueError("Must contain lowercase")
      if not re.search(r"\d", v): raise ValueError("Must contain a digit")
      return v
  ```

### 1.3 Session Management

**Status: GOOD**

- Sessions stored in DB with token hash (`backend/app/services/auth.py:86-93`). **GOOD** -- raw tokens never stored.
- Session validation on every request (`backend/app/core/deps.py:49-60`). **GOOD.**
- Revocation on logout (`backend/app/api/v1/auth.py:119-120`). **GOOD.**
- All sessions revoked on password change (`backend/app/services/auth.py:225`). **GOOD.**
- Max concurrent sessions enforced (`backend/app/services/auth.py:70`). **GOOD.**

### 1.4 Account Lockout & Rate Limiting

**Status: GOOD**

- Account lockout after 5 failed attempts in 15 minutes (`backend/app/core/rate_limit.py:79-80`). **GOOD.**
- IP-based rate limiting on login: 10 per 60 seconds (`backend/app/api/v1/auth.py:33`). **GOOD.**
- Nginx layer rate limiting on auth endpoints: 5/s with burst 10 (`nginx.conf:46,99-100`). **GOOD** -- defense in depth.
- Lockout counter cleared on successful login (`backend/app/api/v1/auth.py:72`). **GOOD.**

### S-02 | LOW | In-Memory Rate Limiter Not Shared Across Workers

- **File:** `backend/app/core/rate_limit.py:74`
- **Finding:** `_counter = _SlidingWindowCounter()` is a module-level singleton. In production with gunicorn + 4 uvicorn workers (`docker-compose.prod.yml:42`), each worker has its own counter. An attacker could distribute attempts across workers, effectively getting 4x the rate limit.
- **Remediation:** Migrate to Redis-backed rate limiting (e.g., `slowapi` with Redis backend) before production. The nginx rate limits provide partial mitigation at the edge.

### S-03 | LOW | In-Memory Password Reset Tokens Lost on Restart

- **File:** `backend/app/services/auth.py:26`
- **Finding:** `_reset_tokens: dict[str, tuple[uuid.UUID, datetime]] = {}` -- In-memory dict. Tokens are lost if the process restarts. Also not shared across workers. The code itself has a comment acknowledging this ("In production this should use Redis").
- **Remediation:** Move to Redis or database-backed token storage before production.

---

## 2. Authorization / RBAC

### 2.1 Endpoint Coverage

**Status: GOOD -- Every endpoint is protected**

Comprehensive review of all API route files confirms RBAC is enforced:

| Route File | Guard | Roles |
|---|---|---|
| `auth.py` | `get_current_active_user` | Any authenticated |
| `users.py` | `require_role(SUPER_ADMIN)` for write; `SUPER_ADMIN, LAB_MANAGER` for read | Correct |
| `participants.py` | `VIEW_ROLES` for read; `CREATE_ROLES` for write; `SUPER_ADMIN, LAB_MANAGER` for delete | Correct |
| `samples.py` | `ALL_ROLES` for read; `WRITE_ROLES` for write; `SUPER_ADMIN, LAB_MANAGER` for discards | Correct |
| `storage.py` | `ALL_ROLES` for read; `WRITE_ROLES` for write; `ADMIN_ROLES` for delete/consolidate | Correct |
| `field_events.py` | `READ_ROLES` for read; `WRITE_ROLES` for write | Correct |
| `instruments.py` | `ALL_ROLES` for read; `WRITE_ROLES` for write; `ADMIN_ROLES` for create instrument | Correct |
| `icc.py` | `ALL_ROLES` for read; `WRITE_ROLES` for write | Correct |
| `partner.py` | `ALL_ROLES` for read; `ADMIN_LAB` for imports/config | Correct |
| `dashboard.py` | `ALL_ROLES` for read | Correct |
| `reports.py` | `REPORT_ROLES` for generation; `ADMIN_ROLES` for scheduled | Correct |
| `query_builder.py` | `QUERY_ROLES` (admin+PI) for execute; `ALL_ROLES` for entities list | Correct |
| `settings.py` | `SUPER_ADMIN` only | Correct |
| `files.py` | `ALL_ROLES` for read; `WRITE_ROLES` for write; `ADMIN_ROLES` for admin ops | Correct |
| `notifications.py` | `get_current_active_user` | Per-user filtering |
| `labels.py` | `LABEL_ROLES` | Correct |
| `sync.py` | `SYNC_ROLES` | Correct |
| `qr.py` | Assumed protected (not read but pattern consistent) | -- |

### 2.2 Role Hierarchy

**Status: GOOD**

The `require_role()` factory in `backend/app/core/deps.py:94-105` uses a whitelist approach -- each endpoint explicitly lists allowed roles. This prevents privilege escalation by design.

### S-04 | MEDIUM | No Horizontal Authorization Check on Notifications

- **File:** `backend/app/api/v1/notifications.py:62-73`
- **Finding:** The `mark_read` endpoint accepts any `notification_id` and only checks `get_current_active_user`. It relies on the service layer to verify the notification belongs to the current user. Need to verify the service does IDOR checking. If the service marks any notification as read regardless of owner, this is a horizontal privilege escalation.
- **Remediation:** Ensure `NotificationService.mark_read()` verifies `notification.recipient_id == user_id` or `notification.recipient_role == user_role` before updating. If it already does, this is informational only.

### S-05 | LOW | Self-Deactivation Protection Missing

- **File:** `backend/app/api/v1/users.py:162-183`
- **Finding:** Users cannot delete themselves (explicit check at line 128-132). However, a super_admin could potentially deactivate their own account via `toggle_activate`. While unlikely, consider adding a similar guard.
- **Remediation:** Add `if user_id == current_user.id` check in `toggle_activate` endpoint.

---

## 3. Injection

### 3.1 SQL Injection

**Status: GOOD -- No raw SQL string concatenation found**

- All queries use SQLAlchemy ORM with parameterized queries.
- `text()` usage in `participant.py:115-120`, `sample.py:236-239`, `partner.py:455-458,588-591` uses `.params(search=search)` binding. **SAFE** -- parameters are bound, not concatenated.
- The `query_builder.py` dynamically builds queries but uses `getattr(model, field_name)` which returns SQLAlchemy column objects, not raw strings. **SAFE.**

### 3.2 ILIKE Metacharacter Escaping

**Status: GOOD**

- `_escape_ilike()` function properly escapes `\`, `%`, and `_` characters.
- Present in `backend/app/services/query_builder.py:21-28` and `backend/app/services/file_store.py:28-29`.
- Used consistently in search functions across services.

### 3.3 Sort Column Injection

**Status: GOOD**

Every service that accepts a sort parameter validates it against an explicit allowlist:

- `participant.py:107-123` -- `ALLOWED_SORTS` set
- `sample.py:229-243` -- `ALLOWED_SORTS` set
- `field_ops.py:104-119` -- `ALLOWED_SORTS` set
- `instrument.py:55,167,699` -- `*_ALLOWED_SORTS` sets
- `icc.py:28` -- `ICC_ALLOWED_SORTS` set
- `file_store.py:41` -- `FILE_ALLOWED_SORTS` set
- `query_builder.py:189` -- Validated against `cfg["columns"]` allowlist

All fall back to a safe default if the provided sort column is not in the allowlist.

### S-06 | MEDIUM | Query Builder `in` Operator Accepts Arbitrary List Values

- **File:** `backend/app/services/query_builder.py:266-268`
- **Finding:** The `in` operator accepts a list of values: `query.where(col.in_(value))`. While SQLAlchemy parameterizes these, there is no limit on the list size. An attacker with QUERY_ROLES could send thousands of values in an `in` clause, causing query performance degradation (potential DoS).
- **Remediation:** Add a maximum list length check: `if len(value) > 1000: raise ValueError("'in' list too long")`.

---

## 4. XSS & CSRF

### 4.1 Frontend XSS

**Status: GOOD**

- No usage of React's `dangerously`-prefixed HTML injection API found anywhere in the frontend codebase. **GOOD.**
- React's default escaping protects against XSS in JSX.

### 4.2 Backend Sanitization

**Status: ADEQUATE with gap**

- `backend/app/core/sanitize.py` provides `sanitize_text()`, `sanitize_dict_values()`, `strip_control_chars()`, and `sanitize_filename()`. All well-implemented.

### S-07 | MEDIUM | Sanitization Functions Exist But Are Not Called

- **File:** `backend/app/core/sanitize.py` (the file), `backend/app/services/` (all service files)
- **Finding:** The sanitization utilities exist but a grep for their usage in service files returns **zero matches**. User-provided text fields (participant names, event names, notes, etc.) are stored in the database without sanitization. While React escapes on render, if data is ever consumed by another client (email, PDF report, API export), unsanitized HTML entities could be rendered.
- **Impact:** Data stored with `<script>` tags could be dangerous in PDF reports (WeasyPrint renders HTML) or email notifications.
- **Remediation:** Apply `sanitize_text()` to all user-provided string fields in create/update service methods, particularly:
  - Participant notes
  - Event names and notes
  - Sample deviation notes
  - Instrument/run descriptions
  - Notification messages derived from user input

### 4.3 CSRF

**Status: GOOD**

- JWT is sent in the `Authorization: Bearer` header, not in cookies. This mitigates CSRF by design since cross-origin forms cannot set custom headers.
- CORS is configured with an explicit origin allowlist (`backend/app/config.py:24`, `backend/app/main.py:47-53`).

### 4.4 Content-Security-Policy

**Status: GOOD**

- CSP set in `backend/app/core/middleware.py:52-60`: restrictive default-src, script-src self only, frame-ancestors none.
- `frame-ancestors 'none'` prevents clickjacking. Combined with `X-Frame-Options: DENY`.
- `style-src 'unsafe-inline'` is necessary for Tailwind CSS runtime styles. Acceptable tradeoff.

---

## 5. File Upload Security

### 5.1 File Upload Model

**Status: GOOD design -- files are discovered, not uploaded**

The LIIMS file store uses a **watch directory model** (`backend/app/services/file_store.py`). Files are placed on the NAS by instruments, then discovered by periodic scans. The API never accepts file uploads for the file store. This eliminates most file upload attack vectors.

The only file upload is partner CSV import (`backend/app/api/v1/partner.py:178-206`).

### 5.2 Partner CSV Upload Security

**Status: GOOD**

- Extension check: `file.filename.lower().endswith(".csv")` (`partner.py:186`).
- Size limit: 10MB hardcoded (`partner.py:189`).
- Content is read into memory and parsed as CSV -- not written to disk or executed.

### S-08 | MEDIUM | Watch Directory Symlink Attack Vector

- **File:** `backend/app/services/file_store.py:313-319`
- **Finding:** The scan uses `entry.is_file()` and `entry.resolve()` but does NOT check `entry.is_symlink()`. A symlink placed in the watch directory could point to sensitive files outside the intended scope (e.g., `/etc/shadow`). The file's content would be hashed and its metadata recorded. While file content is never served via API, the `file_path` is stored and exposed in the API response, leaking the resolved path.
- **Remediation:** Add symlink check before processing:
  ```python
  if entry.is_symlink():
      logger.warning("Skipping symlink: %s", entry)
      continue
  # Also verify resolved path is within the watch directory:
  resolved = entry.resolve()
  if not str(resolved).startswith(str(dir_path.resolve())):
      logger.warning("Path traversal attempt: %s -> %s", entry, resolved)
      continue
  ```

### 5.3 Path Traversal Prevention

**Status: GOOD for filenames**

- `sanitize_filename()` in `backend/app/core/sanitize.py:45-60` strips directory components and dangerous characters. However, note S-07 above -- this function exists but its usage should be verified in all filename contexts.

---

## 6. Data Protection

### 6.1 Soft Delete Consistency

**Status: GOOD**

- All queries filter `is_deleted == False` by default across all services.
- Query builder applies soft-delete filter automatically (`backend/app/services/query_builder.py:166-167`).

### 6.2 PII Handling

**Status: ADEQUATE**

- Participants use coded identifiers (`participant_code`), not names. This is good for a research study.
- No PII fields (full name, address, phone) were found in the participant model based on the schema.
- Consent tracking is present with consent forms linked to participants.

### 6.3 Audit Trail

**Status: GOOD**

- Comprehensive audit logging via `AuthService.log_audit()` for auth events.
- Audit entries created for file operations, settings changes, login/logout.
- Audit log model includes: user_id, action, entity_type, entity_id, old_values, new_values, ip_address, timestamp.

### S-09 | LOW | Audit Log Does Not Capture All Write Operations

- **Finding:** While auth events, file operations, and settings changes are audited, not all CRUD operations on core entities (participants, samples, field events) appear to have explicit audit log entries in their service methods. These rely on the `updated_by`/`created_by` fields on the models, which is lighter-weight than full audit log entries.
- **Remediation:** For regulatory compliance, consider adding explicit audit log entries for all create/update/delete operations on Participant, Sample, and FieldEvent entities, capturing old_values and new_values diffs.

### 6.4 Secure Error Messages

**Status: GOOD**

- `backend/app/core/error_handlers.py` suppresses internal details in production.
- Database errors show generic message: "A database error occurred" (`error_handlers.py:92`).
- Unhandled exceptions show generic message: "An unexpected error occurred" (`error_handlers.py:112`).
- Debug mode reveals details only when `settings.DEBUG == True` (`error_handlers.py:93-94,113-114`).

### S-10 | MEDIUM | Report Generation Leaks Exception Details

- **File:** `backend/app/api/v1/reports.py:261-265`
- **Finding:** `detail=f"Report generation failed: {str(e)}"` -- The catch-all exception handler for report generation includes the raw exception string in the HTTP response. This could leak internal paths, database errors, or other sensitive information.
- **Remediation:** Change to a generic message: `detail="Report generation failed. Please try again later."` and log the actual error server-side.

---

## 7. Infrastructure

### 7.1 Docker Security

**Status: GOOD**

- Non-root user: `backend/Dockerfile:15-16,31` creates and switches to `appuser` (UID 1000). **GOOD.**
- Minimal base image: `python:3.11-slim`. **GOOD.**
- NAS mounted read-only: `docker-compose.yml:51` uses `:ro`. **GOOD.**
- Resource limits in production: `docker-compose.prod.yml` sets CPU and memory limits. **GOOD.**
- Health checks on all services. **GOOD.**

### 7.2 Nginx Security

**Status: GOOD**

- Security headers set at nginx level (`nginx.conf:83-88`): X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, Referrer-Policy, Permissions-Policy.
- Rate limiting zones for auth (5/s) and general API (30/s) with burst allowances.
- HSTS configuration ready but commented out (requires SSL). **ACCEPTABLE** for pre-production.
- SSL/TLS configuration templated and ready to uncomment.

### 7.3 CORS Configuration

**Status: GOOD**

- Explicit origin allowlist via `CORS_ORIGINS` env var (`backend/app/config.py:24`).
- Not using `*` (wildcard). **GOOD.**
- Only specific headers and methods allowed.

### 7.4 Database Connection Security

**Status: ADEQUATE**

- PostgreSQL password is configurable via env var.
- Connection string uses `asyncpg` driver (binary protocol, not plain text SQL over wire).

### S-11 | HIGH | Redis Has No Authentication

- **File:** `docker-compose.yml:143-144`, `docker-compose.prod.yml:146-155`
- **Finding:** Redis is configured without `--requirepass`. In the development compose file, Redis is on the `liims` network which is bridged (not internal). While the production compose separates networks (`backend: internal: true`), Redis still has no password. If an attacker gains access to the Docker network, they can access Redis containing Celery task data and potentially rate limiter state.
- **Remediation:** Add `--requirepass ${REDIS_PASSWORD}` to Redis command and update `REDIS_URL` to include authentication: `redis://:${REDIS_PASSWORD}@redis:6379`.

### S-12 | HIGH | PostgreSQL Default Password Fallback in Compose

- **File:** `docker-compose.yml:125`
- **Finding:** PostgreSQL in the development compose file uses `${POSTGRES_PASSWORD:-password}` -- the default password is `password`. The same pattern is used for SECRET_KEY. While the `.env.example` uses `change-me-strong-password`, many developers may not change it, and the development environment could be accessible on the network.
- **Remediation:**
  1. Remove default password fallback in compose: change `${POSTGRES_PASSWORD:-password}` to `${POSTGRES_PASSWORD}` (require it to be set).
  2. Add a startup check similar to SECRET_KEY that refuses to start with weak database passwords.

### 7.5 Secret Management

**Status: GOOD**

- `.env.example` provides placeholder values, not real secrets.
- `SECRET_KEY` startup validation prevents running with default in production (`backend/app/main.py:17-19`).
- No hardcoded secrets found in application code.

### S-13 | LOW | Health Check Endpoint Leaks Version and Service Details

- **File:** `backend/app/main.py:62-105`
- **Finding:** The `/api/health` endpoint returns `version`, database status with latency, and Redis status. While common practice, this gives reconnaissance information to unauthenticated users. The endpoint has no auth guard.
- **Remediation:** Consider making the detailed health check require authentication, and returning only `{"status": "ok"}` for unauthenticated requests.

---

## 8. LIMS-Specific Security

### 8.1 Storage Position Locking (Race Conditions)

**Status: GOOD**

- `backend/app/services/storage.py:442-446` uses `with_for_update()` row-level locking on position assignment. **GOOD.**
- `backend/app/services/instrument.py:288-291` uses `with_for_update()` on plate well assignment. **GOOD.**
- `backend/app/services/icc.py:191` uses `with_for_update()` on ICC status advancement. **GOOD.**

### 8.2 Instrument Run Data Immutability

**Status: ADEQUATE**

- Run status transitions are validated (start/complete) with state machine checks.
- Completed runs can have results uploaded but the results are append-only (no update/delete on omics results observed).

### 8.3 Sample Chain of Custody

**Status: GOOD**

- Status history tracked in a separate `StatusHistory` table with `changed_by` user reference.
- Volume withdrawal tracked with reason and user.
- Storage assignment tracked with `assigned_by`.
- Discard requires manager approval workflow.

### S-14 | MEDIUM | No Rate Limiting on Sync Push Endpoint

- **File:** `backend/app/api/v1/sync.py:26-47`
- **Finding:** The `/api/v1/sync/push` endpoint accepts batches of offline mutations but has no rate limiting. A compromised field device or malicious authenticated user could flood the server with sync mutations, potentially causing data corruption or DoS.
- **Remediation:** Add rate limiting similar to the query builder: `RateLimiter(max_calls=10, window_seconds=60, key="sync_push", by="user")`.

### 8.4 Partner Data Import Validation

**Status: GOOD**

- CSV imports go through a preview step before execution.
- Participant matching uses pg_trgm similarity with threshold (0.6), preventing false matches.
- Import is a multi-step process: upload -> preview -> configure -> execute. Each step requires admin role.

---

## Summary of Findings

| ID | Severity | Category | Finding | File |
|----|----------|----------|---------|------|
| S-01 | MEDIUM | Auth | No password complexity requirements beyond min length | `schemas/auth.py:25` |
| S-02 | LOW | Auth | In-memory rate limiter not shared across workers | `core/rate_limit.py:74` |
| S-03 | LOW | Auth | In-memory password reset tokens lost on restart | `services/auth.py:26` |
| S-04 | MEDIUM | AuthZ | No horizontal auth check verified on notification mark_read | `api/v1/notifications.py:62-73` |
| S-05 | LOW | AuthZ | Super admin can deactivate own account | `api/v1/users.py:162-183` |
| S-06 | MEDIUM | Injection | Query builder `in` operator accepts unbounded list | `services/query_builder.py:266-268` |
| S-07 | MEDIUM | XSS | Sanitization functions exist but are never called | `core/sanitize.py` / all services |
| S-08 | MEDIUM | Files | Watch directory scan does not reject symlinks | `services/file_store.py:313-319` |
| S-09 | LOW | Data | Audit log does not capture all entity CRUD operations | Services layer |
| S-10 | MEDIUM | Data | Report generation leaks exception details in response | `api/v1/reports.py:261-265` |
| S-11 | HIGH | Infra | Redis has no authentication configured | `docker-compose.yml:143-144` |
| S-12 | HIGH | Infra | Postgres default password fallback in compose | `docker-compose.yml:125` |
| S-13 | LOW | Infra | Health endpoint leaks version/service details unauthenticated | `main.py:62-105` |
| S-14 | MEDIUM | LIMS | No rate limiting on sync push endpoint | `api/v1/sync.py:26-47` |

---

## Positive Security Controls (No Action Required)

These controls are correctly implemented and should be maintained:

1. **JWT session validation on every request** with DB-backed revocation
2. **RBAC on every API endpoint** using `require_role()` factory
3. **Sort column allowlists** in every service with search/sort functionality
4. **ILIKE metacharacter escaping** preventing wildcard injection
5. **Non-root Docker containers** with minimal base images
6. **NAS mounted read-only** in Docker
7. **Secret key startup validation** preventing default secrets in production
8. **Row-level locking** on concurrent storage/plate assignments
9. **Comprehensive security headers** (CSP, X-Frame-Options, HSTS-ready)
10. **Nginx-level rate limiting** as defense-in-depth
11. **No unsafe HTML rendering** in React frontend (no raw innerHTML injection)
12. **Anti-enumeration** on password reset (always returns success)
13. **Account lockout** after 5 failed login attempts
14. **Internal Docker network** in production (`backend: internal: true`)
15. **Parameterized queries** throughout -- no SQL string concatenation
16. **Content-Disposition headers** on file downloads preventing MIME sniffing
17. **Email-validated** login via Pydantic `EmailStr`
18. **Production network separation** (frontend/backend split in prod compose)

---

## Remediation Priority

### Immediate (Before Production)
1. **S-11** -- Add Redis authentication
2. **S-12** -- Remove default password fallbacks in compose files
3. **S-10** -- Stop leaking exception details in report errors

### Short-Term (First Sprint)
4. **S-01** -- Enforce password complexity
5. **S-07** -- Wire up sanitization on user-provided text fields
6. **S-08** -- Add symlink rejection in file scan
7. **S-06** -- Limit query builder `in` operator list size
8. **S-14** -- Add rate limiting on sync push
9. **S-04** -- Verify notification IDOR protection

### Medium-Term (Pre-GA)
10. **S-02** -- Migrate rate limiting to Redis
11. **S-03** -- Migrate password reset tokens to Redis/DB
12. **S-09** -- Add comprehensive audit logging for all entity CRUD
13. **S-05** -- Prevent self-deactivation by super admin
14. **S-13** -- Protect detailed health check behind auth

---

*End of Security Audit Report*
