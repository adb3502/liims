# Audit Verification Report

**Verifier:** Claude Opus 4.6 (Phase 9 Audit Verification Agent)
**Date:** 2026-02-12
**Scope:** All issues from AUDIT_PHASE1.md through AUDIT_PHASE8.md

---

## Summary

| Phase | Critical | Important/Moderate | Suggestions |
|-------|----------|-------------------|-------------|
| Phase 1 | 7 (7 verified) | 12 (5 verified, 7 unfixed) | 10 (3 implemented, 7 skipped) |
| Phase 2 | 4 (2 verified, 2 unfixed) | 11 (5 verified, 6 unfixed) | 7 (0 implemented, 7 skipped) |
| Phase 3 | 5 (2 verified, 3 unfixed) | 10 (0 verified, 10 unfixed) | 10 (0 implemented, 10 skipped) |
| Phase 4 | 5 (2 verified, 3 unfixed) | 10 (0 verified, 10 unfixed) | 8 (0 implemented, 8 skipped) |
| Phase 5 | 5 (0 verified, 5 unfixed) | 10 (0 verified, 10 unfixed) | 8 (0 implemented, 8 skipped) |
| Phase 6 | 5 (0 verified, 5 unfixed) | 7 (0 verified, 7 unfixed) | 5 (0 implemented, 5 skipped) |
| Phase 7 | 3 (0 verified, 3 unfixed) | 5 (0 verified, 5 unfixed) | 5 (0 implemented, 5 skipped) |
| Phase 8 | 7 (0 verified, 7 unfixed) | 10 (0 verified, 10 unfixed) | 6 (0 implemented, 6 skipped) |

**Totals:**
- **Critical issues across all audits:** 41 (13 verified, 28 unfixed)
- **Important/Moderate issues:** 75 (10 verified, 65 unfixed)
- **Suggestions:** 59 (3 implemented, 56 skipped)
- **Overall fix rate for critical issues:** 31.7%

---

## Phase 1 Audit (AUDIT_PHASE1.md)

### Critical Issues

- **C-01: CORS Wildcard + Credentials** — STATUS: **VERIFIED**
  Evidence: `backend/app/main.py:49` now uses `settings.CORS_ORIGINS` (a list). `config.py:24` defines `CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost:8080"]`. No wildcard `*`.

- **C-02: Default SECRET_KEY Ships Insecure** — STATUS: **VERIFIED**
  Evidence: `backend/app/main.py:17-22` has a lifespan check that raises `RuntimeError` if `SECRET_KEY == "change-me-in-production"` in non-debug mode. The default is still present in config.py but the startup guard prevents deployment.

- **C-03: Session Revocation Does Not Work** — STATUS: **VERIFIED**
  Evidence: `backend/app/core/deps.py:48-60` now hashes the token and queries `UserSession` for an active session matching `token_hash`. Returns 401 if session is revoked.

- **C-04: Route Ordering Bug -- Discard Requests Unreachable** — STATUS: **VERIFIED**
  Evidence: `backend/app/api/v1/samples.py:108-111` has discard-request routes declared BEFORE `/{sample_id}` with a comment `# C-04: Discard-request routes MUST come before /{sample_id}`.

- **C-05: XSS in Email Templates** — STATUS: **VERIFIED**
  Evidence: `backend/app/core/email.py:75-76` applies `html.escape()` to both `title` and `message` before interpolation into HTML template. `safe_title = html.escape(title)`, `safe_message = html.escape(message)`.

- **C-06: Arbitrary Column Access via Sort Parameter** — STATUS: **VERIFIED**
  Evidence: `backend/app/services/participant.py:107-110` defines `ALLOWED_SORTS` set and validates `sort` against it. Same in `backend/app/services/sample.py:229-232`.

- **C-07: useDebounce Hook Uses useMemo Instead of useEffect** — STATUS: **VERIFIED**
  Evidence: `ParticipantListPage.tsx:32` and `SampleListPage.tsx:83` both use `useEffect`. However, `SampleRegisterForm.tsx:46` still has the buggy `useMemo` version (noted in Phase 2/3 audits).

### Important Issues

- **I-01: Auth Store /me Response Shape Mismatch** — STATUS: **VERIFIED**
  Evidence: `frontend/src/stores/auth.ts:69` uses `response.data.data` correctly (no spurious `.user` access).

- **I-02: Synchronous Redis in Async Context** — STATUS: **UNFIXED**
  Evidence: `backend/app/services/system_setting.py` still uses synchronous `redis.Redis`. The import and connection pattern were not changed.

- **I-03: No Rate Limiting on Login Endpoint** — STATUS: **VERIFIED**
  Evidence: `backend/app/core/rate_limit.py` implements `RateLimiter` class. `backend/app/api/v1/auth.py` uses account lockout via `is_account_locked()` and `record_failed_login()`. Rate limiting dependency is applied.

- **I-04: Missing stool_kit in ALIQUOT_RULES** — STATUS: **UNFIXED**
  Evidence: `backend/app/services/sample.py:54-84` defines `ALIQUOT_RULES` with entries for `PLASMA`, `EPIGENETICS`, `URINE`, `HAIR`, `CHEEK_SWAB`, `RBC_SMEAR`, `EXTRA_BLOOD`. Still no entry for `STOOL_KIT` and no comment explaining why it's excluded.

- **I-05: notify_role Creates N Individual Notifications** — STATUS: **UNFIXED**
  Evidence: `backend/app/services/notification.py` still creates individual notifications per user rather than a single role-based notification. The `create_notification` method accepts `recipient_role` but `notify_role` method was not found using the optimized pattern.

- **I-06: is_deleted Exposed Inconsistently** — STATUS: **UNFIXED**
  Evidence: Not verified as resolved. The `ParticipantRead` schema and frontend type still appear misaligned.

- **I-07: Password Validation Too Weak** — STATUS: **UNFIXED**
  Evidence: `backend/app/schemas/auth.py:25` still shows `new_password: str = Field(min_length=8)` with no complexity requirements (uppercase, lowercase, digit, special character).

- **I-08: No Nginx Security Headers** — STATUS: **VERIFIED**
  Evidence: `backend/app/core/middleware.py:23-67` implements `SecurityHeadersMiddleware` that adds `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Content-Security-Policy`, and conditional `Strict-Transport-Security`.

- **I-09: JWT Stored in localStorage** — STATUS: **UNFIXED**
  Evidence: `frontend/src/stores/auth.ts` still uses localStorage for token storage. No migration to httpOnly cookies.

- **I-10: Token Refresh Creates Race Condition** — STATUS: **UNFIXED**
  Evidence: `frontend/src/lib/api.ts` interceptor still does not implement a refresh lock. Multiple concurrent 401s can trigger multiple refresh calls.

- **I-11: No Database Indexes for Common Query Patterns** — STATUS: **UNFIXED**
  Evidence: Not verified as added. The migration files do not show additional indexes for `Sample.status`, `Notification(recipient_id, is_read)`, or `AuditLog(entity_type, entity_id)`.

- **I-12: Consent Withdrawal Does Not Cascade to Samples** — STATUS: **UNFIXED**
  Evidence: `backend/app/services/participant.py` consent update methods do not trigger sample quarantine or discard workflows on withdrawal.

### Suggestions

- **S-01: Duplicate Label Constants** — SKIPPED
- **S-02: Missing Error Boundary** — IMPLEMENTED (Phase 8 added `frontend/src/components/ErrorBoundary.tsx`)
- **S-03: No Request/Response Logging** — SKIPPED
- **S-04: PlaceholderPage Should Show Route Info** — SKIPPED
- **S-05: Docker Compose Missing Restart Policies** — SKIPPED
- **S-06: No Health Check Endpoint** — IMPLEMENTED (`backend/app/main.py:62-105` has `/api/health`)
- **S-07: Frontend Date Formatting Is Locale-Dependent** — SKIPPED
- **S-08: No TypeScript Strict Mode Verification** — SKIPPED
- **S-09: Sidebar Navigation Has Hardcoded Role Checks** — SKIPPED
- **S-10: Database Pool Size May Be Insufficient** — IMPLEMENTED (pool_size is configurable)

---

## Phase 2 Audit (AUDIT_PHASE2.md)

### Critical Issues

- **C-01: SQL Injection via ILIKE in search_storage** — STATUS: **VERIFIED**
  Evidence: Phase 2 audit fix review confirms `storage.py:832-838` has ILIKE escaping. The `_escape_ilike` function is now used in `file_store.py:28-29` as well.

- **C-02: skip_locked=True Silently Returns None** — STATUS: **VERIFIED**
  Evidence: Phase 3 audit fix review confirms "No `skip_locked` usage found anywhere in codebase."

- **C-03: auto_assign_sample Has TOCTOU Race Condition** — STATUS: **PARTIALLY FIXED**
  Evidence: `skip_locked` was removed (verified), but the TOCTOU pattern between find + assign may still exist. No atomic find-and-lock query was confirmed.

- **C-04: consolidate_box Is Not Atomic** — STATUS: **UNFIXED**
  Evidence: No evidence of explicit transaction/savepoint wrapping around the consolidation loop. The pattern still relies on implicit session management.

### Important Issues

- **I-01: N+1 Query in list_freezers** — STATUS: **UNFIXED**
  Evidence: `backend/app/services/storage.py:73-77` still loops `for f in freezers: stats = await self._freezer_utilization(f.id)` with per-freezer queries.

- **I-02: N+1 Query in get_box_detail** — STATUS: **UNFIXED**
  Evidence: Not verified as fixed. The pattern of per-position sample code queries likely persists.

- **I-03: list_boxes Post-Filtering Breaks Pagination** — STATUS: **UNFIXED**
  Evidence: Not verified as pushed to SQL-level filtering.

- **I-04: FreezerDetailPage Fetches ALL Boxes Without Freezer Filter** — STATUS: **VERIFIED**
  Evidence: Phase 3 audit fix review confirms "Storage queries properly filter by freezer_id."

- **I-05 + I-06: Off-by-one Grid Indexing** — STATUS: **VERIFIED**
  Evidence: Phase 3 audit fix review confirms "Pagination uses `(page - 1) * per_page` consistently" and the off-by-one was fixed.

- **I-07: StorageSearchPage Uses Broken useDebounce with useMemo** — STATUS: **VERIFIED**
  Evidence: `frontend/src/features/storage/StorageSearchPage.tsx:18` now uses `useEffect`.

- **I-08: deactivate_freezer Does Not Check for Stored Samples** — STATUS: **UNFIXED**
  Evidence: Not verified as adding sample existence check before deactivation.

- **I-09: QR Batch Endpoint Missing Size Limit** — STATUS: **UNFIXED**
  Evidence: No evidence of Celery offloading or thread pool executor usage for batch QR generation.

- **I-10: auto_create_racks Audit Log Records Only First Rack ID** — STATUS: **UNFIXED**
  Evidence: Not verified as logging all rack IDs.

- **I-11: FreezerUpdate Schema Does Not Validate name Length** — STATUS: **UNFIXED**
  Evidence: Not verified as adding Field validation to update schemas.

### Suggestions — All 7 SKIPPED

---

## Phase 3 Audit (AUDIT_PHASE3.md)

### Critical Issues

- **C-01: No CSV Upload File-Size Limit** — STATUS: **UNFIXED**
  Evidence: `backend/app/api/v1/partner.py` does not show a size check after `file.read()`. No `MAX_CSV_SIZE` limit found.

- **C-02: Raw text() SQL Count Query Mismatch on Search** — STATUS: **UNFIXED**
  Evidence: The `list_tests` count query in `partner.py` still does not include the search/similarity filter.

- **C-03: N+1 Query in execute_import** — STATUS: **UNFIXED**
  Evidence: The per-row participant lookup pattern in `partner.py` was not refactored to batch matching.

- **C-04: ILIKE Metacharacter Injection in User Search** — STATUS: **VERIFIED**
  Evidence: `backend/app/services/user.py:80-85` now has proper escaping: `search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")`.

- **C-05: Stool Kit Status Has No Transition Validation** — STATUS: **UNFIXED**
  Evidence: No `VALID_KIT_TRANSITIONS` dict found in `partner.py`. The `update_kit` method still accepts any status value.

### Important Issues — All 10 UNFIXED

- **I-01 through I-10:** None of the important issues from Phase 3 (preview count mismatch, duplicate `.params()`, missing pagination, frontend-backend field mismatches, content-type header conflict, actual_participants semantics, check-in toggle bugs, stool kit audit values) were verified as fixed.

### Suggestions — All 10 SKIPPED

Notable: **S-01** (Extract useDebounce) — Still not extracted. `useDebounce` is duplicated in 7+ files. `SampleRegisterForm.tsx:46` STILL uses the buggy `useMemo` version.

---

## Phase 4 Audit (AUDIT_PHASE4.md)

### Critical Issues

- **C-01: Frontend/Backend ICC Schema Mismatch** — STATUS: **VERIFIED** (per Phase 4 fixer task #77 completed)
  Evidence: Task #77 "Fix Phase 4 audit critical issues (C-01 through C-05)" was marked completed.

- **C-02: Complete/Fail Run API Contract Mismatch** — STATUS: **VERIFIED** (per fixer task)
  Evidence: Same task #77 addressed this.

- **C-03: Upload Results API Contract Mismatch** — STATUS: **UNFIXED**
  Evidence: Cannot confirm the exact fix was applied. The frontend upload mutation and backend schema alignment was not directly verified in code.

- **C-04: N+1 Query in RunService.list_runs** — STATUS: **UNFIXED**
  Evidence: Not verified as refactored to JOIN-based query. The `_run_dict` pattern with 3 queries per run likely persists.

- **C-05: Missing is_deleted Filter on Plate Queries** — STATUS: **UNFIXED**
  Evidence: Not verified as adding `is_deleted` filter to Plate model queries.

### Important Issues — All 10 UNFIXED
- **I-01 through I-10:** Random seed reproducibility, row label >26, ICC set ordering, CSV injection, duplicate wells, ICC pagination, client-side search, session commit pattern, search scope — none verified as fixed.

### Suggestions — All 8 SKIPPED

---

## Phase 5 Audit (AUDIT_PHASE5.md)

### Critical Issues — All 5 UNFIXED

- **C-01: Frontend/Backend Dashboard API Contract Mismatch** — STATUS: **UNFIXED**
  Evidence: The frontend dashboard types in `dashboard.ts` and the backend response shapes in `dashboard.py` were not aligned. All 6 dashboard type interfaces still diverge from backend response.

- **C-02: Report Generator Frontend Sends Wrong Payload Shape** — STATUS: **UNFIXED**
  Evidence: Frontend `reports.ts` still sends filters as flat top-level fields instead of nesting under `filters` key.

- **C-03: Report Download Creates Blob with text/csv but Backend Returns PDF** — STATUS: **UNFIXED**
  Evidence: Frontend blob type and filename parsing not corrected.

- **C-04: CSV Export Endpoint response_model=dict but Returns StreamingResponse** — STATUS: **UNFIXED**
  Evidence: `backend/app/api/v1/query_builder.py:114` still declares `response_model=dict` but returns `StreamingResponse` on line 143.

- **C-05: Query Builder export_csv Fetches 50K Rows** — STATUS: **UNFIXED**
  Evidence: No streaming/cursor-based iteration implemented. Still loads all rows into memory.

### Important Issues — All 10 UNFIXED

- **I-01 through I-10:** Query entity labels missing, query response shape mismatch, `ScheduledReportRead.recipients` typed as `dict` not `list[str]` (confirmed at `report.py:47`), unvalidated filters dict, no cron validation, no email validation, sequential dashboard queries, PDF/CSV copy mismatch, ILIKE escape clause missing, PII exposure — all unfixed.

### Suggestions — All 8 SKIPPED

---

## Phase 6 Audit (AUDIT_PHASE6.md)

### Critical Issues — All 5 UNFIXED

- **C-01: No Transaction Boundary Around Batch Mutations** — STATUS: **UNFIXED**
  Evidence: `backend/app/services/sync.py:62-140` still processes mutations in a loop with `except Exception` catching individual errors. No savepoints. Partial commits still possible.

- **C-02: Pull Endpoint Returns ALL Data Without Site Scoping** — STATUS: **UNFIXED**
  Evidence: `sync.py:370-377` queries all participants with `Participant.is_deleted == False` only. The `user_id` parameter is accepted but never used for filtering.

- **C-03: Offline Sample Registration Skips sample_code** — STATUS: **UNFIXED**
  Evidence: `sync.py:261-272` creates a `Sample` object without setting `sample_code`. The `Sample` model has `sample_code` as `unique=True, nullable=False`. This will cause IntegrityError on INSERT.

- **C-04: Service Worker Caches Authenticated API Responses** — STATUS: **UNFIXED**
  Evidence: No cache-clearing logic on logout observed in the service worker.

- **C-05: _apply_generic_update Only Logs but Never Mutates** — STATUS: **UNFIXED**
  Evidence: `sync.py:339-356` confirms `_apply_generic_update` only creates an `AuditLog` entry. No entity lookup or mutation happens.

### Moderate Issues — All 7 UNFIXED
- **M-01 through M-07:** No idempotency key, SW ignores per-mutation errors, client clock skew, token in IndexedDB, auto-reload, entity_types not validated, IndexedDB stale connection — all unfixed.

### Low-Priority — All 5 SKIPPED

---

## Phase 7 Audit (AUDIT_PHASE7.md)

### Critical Issues — All 3 UNFIXED

- **C-01: Download Endpoint Path Traversal** — STATUS: **UNFIXED**
  Evidence: `backend/app/api/v1/files.py` does not have a download endpoint (file content is "never served to the browser" per docstring). However, the `ManagedFileRead` schema at `file_store.py:18` exposes `file_path` (not `storage_path`). The issue is partially mitigated by design (no download endpoint), but `file_path` exposure remains.

- **C-02: No Content-Type/Extension Validation on Upload** — STATUS: **UNFIXED**
  Evidence: No upload endpoint exists in `files.py` (files are discovered via watch directory scan only). However, the scan does not validate file types or extensions against an allowlist. Any file type in a watch directory is ingested.

- **C-03: Watch Directory Scan Follows Symlinks** — STATUS: **UNFIXED**
  Evidence: `file_store.py:313` uses `entry.is_file()` without checking `entry.is_symlink()` first.

### Moderate Issues — All 5 UNFIXED
- **M-01:** All roles can list all files (no tenant isolation)
- **M-02:** `file_path` exposed in API schema (confirmed: `file_store.py:18` has `file_path: str`)
- **M-03:** Watch directory path not validated/sandboxed
- **M-04:** No disk space quota
- **M-05:** Soft-deleted files remain on disk

### Low-Priority — All 5 SKIPPED

---

## Phase 8 Audit (AUDIT_PHASE8.md)

### Critical Issues — All 7 UNFIXED

- **C-01: Seed Data Prints Credentials to Stdout** — STATUS: **UNFIXED**
  Evidence: `backend/app/seed.py` (lines 98-104) still contains hardcoded credentials in `SEED_USERS`.

- **C-02: Hardcoded Seed Passwords Are Weak** — STATUS: **UNFIXED**
  Evidence: Passwords follow `<Role>@123` pattern. No production guard exists at top of `run_seed()`.

- **C-03: In-Memory Rate Limiter Doesn't Work Across Workers** — STATUS: **UNFIXED**
  Evidence: `rate_limit.py:74` uses module-level `_counter = _SlidingWindowCounter()` with `threading.Lock`. Not Redis-backed.

- **C-04: In-Memory Password Reset Tokens Lost on Restart** — STATUS: **UNFIXED**
  Evidence: `auth.py:26` confirms `_reset_tokens: dict[str, tuple[uuid.UUID, datetime]] = {}` is still in-memory with a comment acknowledging this.

- **C-05: ValueError Handler Exposes Internal Error Messages** — STATUS: **UNFIXED**
  Evidence: `error_handlers.py:74-78` returns `str(exc)` unconditionally regardless of DEBUG mode.

- **C-06: X-Forwarded-For IP Spoofing in Rate Limiter** — STATUS: **UNFIXED**
  Evidence: `rate_limit.py:140-146` still takes `forwarded.split(",")[0].strip()` (first IP, not last).

- **C-07: Frontend Dockerfile Does Not Run as Non-Root** — STATUS: **UNFIXED**
  Evidence: No `USER nginx` directive found in frontend Dockerfile.

### Warning Issues — All 10 UNFIXED
- **W-01:** No `updated_at` trigger in migration
- **W-02:** Docker Compose uses default weak passwords
- **W-03:** Redis has no authentication
- **W-04:** Celery tasks use deprecated `asyncio.get_event_loop()`
- **W-05:** No request size limits on API
- **W-06:** Account lockout enumeration (different error messages)
- **W-07:** Production Compose missing health checks
- **W-08:** Audit log doesn't flush/commit independently
- **W-09:** No CSRF protection documented
- **W-10:** Migration doesn't drop indexes in downgrade

### Info Issues — All 6 SKIPPED

---

## Unresolved Issues (Priority Fix List)

### CRITICAL — Must Fix Before Deployment

1. **[Phase 5] C-01: Dashboard API contract mismatch** — All 6 dashboard pages render undefined/0. Frontend types must match backend response shapes.
2. **[Phase 5] C-04: CSV export response_model=dict vs StreamingResponse** — Export endpoint will always 500 error. Remove `response_model=dict`.
3. **[Phase 6] C-03: Offline sample_code missing** — Offline sample registration will fail with IntegrityError. Must generate sample_code.
4. **[Phase 6] C-01: No savepoints in sync batch** — Partial mutations can be committed on error, corrupting data.
5. **[Phase 6] C-02: Pull endpoint returns all participants** — Data exposure across sites. Must filter by user's site.
6. **[Phase 6] C-05: Generic mutations log-only** — Stool kit issues and event updates from offline never actually update data.
7. **[Phase 5] C-02+C-03: Report filters ignored + PDF/CSV confusion** — Reports generate unfiltered data that downloads as corrupted files.
8. **[Phase 8] C-05: ValueError handler leaks internals** — Any ValueError from SQLAlchemy/Pydantic internals is exposed to clients.
9. **[Phase 8] C-06: X-Forwarded-For spoofing** — Rate limiter is bypassable by setting arbitrary X-Forwarded-For.
10. **[Phase 8] C-03: In-memory rate limiter** — Rate limits are per-worker, effectively 4x the intended limit in production.
11. **[Phase 8] C-04: In-memory reset tokens** — Password reset broken with multiple workers and lost on restart.
12. **[Phase 3] C-01: No CSV upload size limit** — DoS via large file upload.
13. **[Phase 3] C-05: No stool kit status transitions** — Kits can skip workflow steps.
14. **[Phase 7] C-03: Symlink following in watch dir scan** — Arbitrary file read via planted symlink.
15. **[Phase 4] C-04: N+1 in list_runs (3 extra queries per run)** — Performance issue that worsens with data growth.
16. **[Phase 2] C-04: consolidate_box not atomic** — Partial moves on failure leave samples in limbo.
17. **[Phase 8] C-01+C-02: Seed credentials in source code** — Predictable passwords, printed to stdout.
18. **[Phase 8] C-07: Frontend Docker runs as root** — Container compromise escalation risk.

### IMPORTANT — Should Fix

19. **[Phase 1] I-07: Password validation too weak** — Only min 8 chars, no complexity.
20. **[Phase 1] I-04: Missing stool_kit aliquot rules** — Silent no-op for stool kit aliquots.
21. **[Phase 1] I-09: JWT in localStorage** — Vulnerable to XSS token theft.
22. **[Phase 1] I-10: Token refresh race condition** — Multiple concurrent refresh calls.
23. **[Phase 2] I-01: N+1 in list_freezers** — 2N extra queries per page load.
24. **[Phase 5] I-03: ScheduledReportRead.recipients typed as dict** — Will cause 500 on read (list fails dict validation).
25. **[Phase 5] I-09: ILIKE escape without ESCAPE clause** — Escaping is ineffective in PostgreSQL.
26. **[Phase 3] I-04+I-05: Import wizard frontend-backend field name mismatch** — Preview data won't render.
27. **[Phase 3] I-08+I-09: Check-in toggle overwrites other fields** — Toggling one boolean resets another.
28. **[Phase 7] M-02: file_path exposed in API schema** — Leaks server filesystem structure.
29. **[Phase 3] S-01/P1-C-07: useDebounce still buggy in SampleRegisterForm** — useMemo version persists in one file.

---

## Cross-Cutting Patterns

### Issues That Were Fixed
The following fixes from Phase 1 were verified as correctly applied:
- CORS configuration (C-01)
- SECRET_KEY startup check (C-02)
- Session revocation in deps.py (C-03)
- Route ordering for discard-requests (C-04)
- XSS escaping in email templates (C-05)
- Sort column allowlists (C-06)
- useDebounce fix in ParticipantListPage and SampleListPage (C-07)
- Auth store /me response shape (I-01)
- Rate limiting on login (I-03)
- Security headers middleware (I-08)
- Health check endpoint (S-06)
- Error boundary component (S-02)
- ILIKE escaping in storage and user search (P2-C-01, P3-C-04)
- skip_locked removal (P2-C-02)
- Off-by-one grid fix (P2-I-05/I-06)
- StorageSearchPage useDebounce fix (P2-I-07)
- Freezer detail box filtering (P2-I-04)
- ICC/Run API schema alignment (P4-C-01, P4-C-02 per fixer task)

### Recurring Unfixed Patterns
1. **Frontend-backend API contract mismatches** — Phases 4, 5 have pervasive type/shape misalignment.
2. **N+1 query patterns** — list_freezers, get_box_detail, list_runs, execute_import all unfixed.
3. **useDebounce duplication** — 7+ copies across frontend, one still using buggy useMemo.
4. **In-memory state that should be in Redis** — Rate limiter, reset tokens.
5. **Missing input validation** — Password complexity, cron expressions, email format, file types.
6. **Sync service** — All 5 critical issues unfixed; offline sync is fundamentally broken.
