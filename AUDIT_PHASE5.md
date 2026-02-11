# Phase 5 Audit Report

## Critical Issues

### C-01: Frontend/Backend dashboard API contract mismatch -- frontend types don't match backend response shapes
**File:** `frontend/src/api/dashboard.ts:10-71`, `backend/app/services/dashboard.py:32-527`
**Issue:** Every frontend dashboard type diverges from the backend response shape, meaning the dashboards will render incorrect/missing data:

- **EnrollmentStats** (line 10): Frontend expects `{ total, by_site: [{ site_id, site_name, count }], enrollment_over_time: [{ date, count, cumulative }] }`. Backend returns `{ total_participants, by_site: [{ site_name, site_code, count }], enrollment_rate_30d: [{ date, count }], by_wave }`. Key mismatches: `total` vs `total_participants`, `enrollment_over_time` vs `enrollment_rate_30d`, no `cumulative` field from backend, `site_id` doesn't exist (backend sends `site_code`).
- **InventoryStats** (line 17): Frontend expects `freezer_utilization: [{ freezer_id, freezer_name, used, capacity, utilization_pct }]`. Backend returns `[{ freezer_name, freezer_type, total_positions, occupied, utilization_pct }]`. No `freezer_id`, `used` should be `occupied`, `capacity` should be `total_positions`.
- **FieldOpsStats** (line 30): Frontend expects `{ events_by_status, checkin_rates: { total_expected, checked_in, rate }, upcoming_events: [{ id, event_name, site_name, event_date, status }] }`. Backend returns `{ by_status, check_in_rate: { total_registrations, checked_in, rate_pct }, upcoming_events: [{ id, event_name, event_date, status, expected_participants }] }`. `events_by_status` vs `by_status`, `checkin_rates` vs `check_in_rate`, `total_expected` vs `total_registrations`, `rate` vs `rate_pct`, no `site_name` in upcoming.
- **InstrumentStats** (line 42): Frontend expects `{ runs_by_status, runs_by_type, recent_runs: [{ instrument_name, started_at }] }`. Backend returns `{ by_status, by_type, recent_runs: [{ run_name, run_type, status, created_at }] }`. `runs_by_status` vs `by_status`, `runs_by_type` vs `by_type`, no `instrument_name` (backend sends `run_type`), `started_at` vs `created_at`.
- **QualityStats** (line 54): Frontend expects `{ qc_pass_fail: { passed, failed, pending }, icc_completion: [...], omics_coverage: { total_participants, proteomics_count, metabolomics_count } }`. Backend returns `{ qc: { total_reviewed, passed, pass_rate_pct, by_status }, icc: { total_processing, analysis_complete, completion_rate_pct }, omics_coverage: { samples_with_results, total_samples, coverage_pct, by_type }, deviations }`. `qc_pass_fail` vs `qc`, no `pending` field, no `proteomics_count`/`metabolomics_count` (backend groups by `by_type`), `total_participants` vs `total_samples`.
- **DashboardOverview** (line 64): Frontend expects `{ enrollment: { total, recent_30d }, samples: { total, in_storage }, storage: { utilization_pct }, field_ops: { upcoming_count, completion_rate }, instruments: { active_runs }, quality: { qc_pass_rate } }`. Backend returns a flat dict: `{ total_participants, total_samples, samples_stored, total_field_events, upcoming_events_7d, total_instrument_runs, active_instrument_runs }`. Backend has no nested structure and no `quality.qc_pass_rate`.

**Impact:** All six dashboard pages and the main DashboardPage will render `undefined` or `0` for most metrics. The EnrollmentDashboardPage chart will be empty, the InventoryDashboardPage freezer bars will show NaN, and the QualityDashboardPage QC card will show 0/0/0.
**Fix:** Either restructure the backend responses to match the frontend types, or update all frontend types and page components to use the actual backend response shapes. Given the backend shapes are already well-organized, updating the frontend is recommended.

### C-02: Report generator frontend sends wrong payload shape -- `GenerateReportParams` doesn't match `ReportGenerateRequest`
**File:** `frontend/src/api/reports.ts:19-28`, `frontend/src/features/reports/ReportGeneratorPage.tsx:71-84`, `backend/app/schemas/report.py:13-15`
**Issue:** The frontend `GenerateReportParams` sends `{ report_type, site_id?, wave?, date_from?, date_to?, sample_type?, sample_status?, event_status? }` as flat top-level fields. The backend `ReportGenerateRequest` expects `{ report_type: ReportType, filters: dict | None }`. The backend will accept the request (Pydantic v2 ignores extra fields by default) but `data.filters` will always be `None` because the frontend sends filters as top-level fields, not nested under a `filters` key. This means all report filters are silently ignored -- every report generates unfiltered data regardless of what the user selects.
**Fix:** Change the frontend to nest filter params inside a `filters` object: `{ report_type: "enrollment_summary", filters: { site_id: "...", wave: 1 } }`.

### C-03: Report download creates blob with `type: 'text/csv'` but backend returns PDF
**File:** `frontend/src/api/reports.ts:57`, `backend/app/api/v1/reports.py:62-67`
**Issue:** The frontend `useGenerateReport` mutation creates a `Blob` with `{ type: 'text/csv' }` and downloads it with a `.csv` extension (fallback filename `${params.report_type}_report.csv`). The backend returns `media_type="application/pdf"` with a `.pdf` filename. The MIME type mismatch means the downloaded file will have a `.csv` extension but contain PDF binary data, making it unopenable by default. The frontend's `Content-Disposition` header parsing (line 62-63) would extract the correct `.pdf` filename if the header is present, but `split('filename=')[1]` fails silently on the `inline; filename="..."` format (it would extract `"enrollment_summary_20260212_120000.pdf"` with quotes still present). The fallback always produces `.csv`.
**Fix:** Change the blob type to `'application/pdf'`, fix the filename parsing to handle the `inline; filename="..."` format properly, and update the fallback extension to `.pdf`.

### C-04: CSV export endpoint declares `response_model=dict` but returns `StreamingResponse` -- OpenAPI schema mismatch
**File:** `backend/app/api/v1/query_builder.py:109`
**Issue:** The `/export` endpoint is annotated with `response_model=dict` but returns a `StreamingResponse` for successful exports (line 136). FastAPI's `response_model` validation will attempt to serialize the `StreamingResponse` object as a dict, which will fail at runtime with a validation error. For the empty case (line 133), it returns a dict which is valid. This means CSV export will always fail with a 500 error for non-empty results.
**Fix:** Remove `response_model=dict` from the decorator or change it to `response_model=None` so FastAPI passes the `StreamingResponse` through unchanged.

### C-05: Query builder `export_csv` fetches up to 50,000 rows in a single query -- potential DoS
**File:** `backend/app/services/query_builder.py:228-237`
**Issue:** `export_csv` calls `execute_query` with `per_page=50000`. This loads up to 50,000 rows into memory at once, serializes them all to dicts, then writes them to a CSV string. For entities with many columns (e.g., `samples` has 14 columns), this could consume hundreds of megabytes of memory per request. A malicious or careless user could trigger this on `partner_results` (which has no soft-delete filter) to dump the entire table. Combined with the `QUERY_ROLES` restriction (only SUPER_ADMIN, LAB_MANAGER, PI_RESEARCHER), the blast radius is limited but still dangerous.
**Fix:** Use server-side streaming (cursor-based iteration with `yield_per()`) to stream CSV rows without loading all into memory. Alternatively, reduce the hard limit to 10,000 and add a configurable export limit in settings.

## Important Issues

### I-01: Frontend `QueryEntity` type expects `label` field but backend returns `entity` name without labels
**File:** `frontend/src/api/query-builder.ts:12-16`, `backend/app/services/query_builder.py:100-121`
**Issue:** The frontend `QueryEntity` interface expects `{ entity, label, fields: [{ name, label, type, operators }] }`. The backend returns `{ entity, fields: [{ name, type }], default_sort }`. There is no `label` field on entities and no `label` or `operators` array on fields. The frontend QueryBuilderPage renders `entity.label` (line 188) -- this will render as `undefined`. The filter operator dropdown (line 240) iterates `fieldDef?.operators` which will be `undefined`, falling back to a single `['eq']` option.
**Fix:** Either add `label` and `operators` fields to the backend entity list response, or compute them on the frontend from the entity name and field type.

### I-02: Frontend `QueryResponse` type doesn't match backend response shape
**File:** `frontend/src/api/query-builder.ts:45-51`, `backend/app/api/v1/query_builder.py:94-98`
**Issue:** The frontend `QueryResponse` expects `{ columns, rows, total, page, per_page }`. The backend returns `{ success, data: [...rows], meta: { page, per_page, total, total_pages } }`. There is no `columns` property in the backend response. The frontend's `result.columns.map(...)` (QueryBuilderPage line 389) will crash with `TypeError: Cannot read properties of undefined (reading 'map')` since `columns` doesn't exist on the response.
**Fix:** Either add a `columns` field to the backend response, or derive columns on the frontend from `Object.keys(data[0])` when results are available.

### I-03: `ScheduledReportRead.recipients` typed as `dict` but model stores `list[str]` via JSONB
**File:** `backend/app/schemas/report.py:47`, `backend/app/models/system.py:50`
**Issue:** The `recipients` column is JSONB and the `ScheduledReportCreate` schema correctly types it as `list[str]`. However, `ScheduledReportRead` declares `recipients: dict` (line 47) with a comment "stored as JSONB, comes back as list". When Pydantic v2 validates the response, a `list[str]` value will fail validation against the `dict` type annotation, causing a 500 error on the read endpoints. This affects `GET /reports/scheduled`, `GET /reports/scheduled/{id}`, `POST /reports/scheduled`, and `PUT /reports/scheduled/{id}`.
**Fix:** Change `recipients: dict` to `recipients: list[str]` in `ScheduledReportRead`.

### I-04: `ReportGenerateRequest.filters` accepts arbitrary `dict` -- no validation
**File:** `backend/app/schemas/report.py:14-15`, `backend/app/services/report.py:72-83`
**Issue:** The `filters` field is typed as `dict | None` with no schema validation. The report service directly accesses keys like `filters["site_id"]` and `filters["wave"]` and passes them to `uuid.UUID()` and equality comparisons. If a malicious user sends `{ "site_id": "not-a-uuid" }`, `uuid.UUID("not-a-uuid")` will raise a `ValueError` that propagates as an unhandled 500 error. More concerning, unexpected filter keys are silently ignored, and there's no type coercion for the `wave` value (could be a string).
**Fix:** Create a proper Pydantic schema for report filters (e.g., `ReportFilters`) with typed fields: `site_id: uuid.UUID | None`, `wave: int | None`, etc. Use this instead of the raw `dict`.

### I-05: No cron expression validation on `ScheduledReportCreate.schedule_cron`
**File:** `backend/app/schemas/report.py:23-26`
**Issue:** `schedule_cron` only validates length (1-50 characters). A user could submit `"* * * * *"` (every minute) or invalid syntax like `"hello world"`. There is no validation that the string is a valid cron expression, and no frequency throttle. A cron of `"* * * * *"` would attempt to generate and email a PDF report every minute.
**Fix:** Add a Pydantic `field_validator` that parses the cron expression (e.g., using `croniter.is_valid()`) and rejects schedules more frequent than hourly.

### I-06: Scheduled report `recipients` has no email validation
**File:** `backend/app/schemas/report.py:27-30`
**Issue:** `recipients: list[str]` validates that it's a non-empty list of strings, but doesn't validate that the strings are valid email addresses. Users could submit `["not-an-email", "../../etc/passwd"]`. When the scheduler eventually tries to send to these addresses, it will either fail silently or potentially cause issues depending on the email library used.
**Fix:** Use `list[EmailStr]` (from `pydantic`) instead of `list[str]` to validate email format.

### I-07: Dashboard service executes 7+ sequential queries for `overview()` -- no parallelism
**File:** `backend/app/services/dashboard.py:473-527`
**Issue:** The `overview()` method executes 7 sequential `COUNT(*)` queries, each requiring a full table scan. For the main dashboard page loaded on every login, this creates unnecessary latency. The individual dashboard endpoints (`enrollment_summary`, `inventory_summary`, etc.) each execute 3-6 queries sequentially as well.
**Fix:** Use `asyncio.gather()` to execute independent count queries in parallel, or combine multiple counts into a single query using conditional aggregation:
```python
select(
    func.count(Participant.id).filter(Participant.is_deleted == False),
    func.count(Sample.id).filter(Sample.is_deleted == False),
    ...
)
```

### I-08: `ReportGeneratorPage` describes CSV but backend returns PDF
**File:** `frontend/src/features/reports/ReportGeneratorPage.tsx:93-95`, `frontend/src/features/reports/ReportGeneratorPage.tsx:252`
**Issue:** The page subtitle says "Generate and download CSV reports" and the button says "Generate & Download CSV", but the backend generates PDFs via WeasyPrint. This UX confusion compounds C-03 where the blob type is also wrong.
**Fix:** Update the copy to say "PDF reports" and "Generate & Download PDF".

### I-09: `_escape_ilike` escaping order is correct but no escape clause is specified on the ILIKE
**File:** `backend/app/services/query_builder.py:21-28`, `backend/app/services/query_builder.py:263-264`
**Issue:** The `_escape_ilike` function escapes `\`, `%`, and `_` using backslash escaping, but the `ilike()` call on line 264 does not specify `escape="\\"`. In PostgreSQL, `ILIKE` does not use backslash escaping by default -- the escape character must be explicitly specified with an `ESCAPE` clause. Without it, the escaped characters like `\%` are treated as literal backslash followed by wildcard `%`, not as an escaped percent sign. This means the escaping is ineffective.
**Fix:** Change line 264 to: `return query.where(col.ilike(f"%{safe}%", escape="\\"))`.

### I-10: `partner_results` entity in query builder has `soft_delete: False` but has no deletion safeguard
**File:** `backend/app/services/query_builder.py:78-88`
**Issue:** The `partner_results` entity config sets `soft_delete: False`, meaning all partner lab results are queryable without any deletion filter. If partner lab results include sensitive patient data from external labs, the query builder exposes all of it without restriction beyond role-based access. This is technically correct (the model has no `is_deleted` column) but is worth noting since the `test_value` and `participant_code_raw` fields could contain sensitive data exposed to PI_RESEARCHER role users via the query builder.
**Fix:** Review whether `participant_code_raw` should be excluded from the queryable columns if it contains PII, or ensure that the `QUERY_ROLES` restriction is sufficient.

## Suggestions

### S-01: `ReportType` frontend interface name shadows the backend enum conceptually
**File:** `frontend/src/api/reports.ts:12-17`
**Issue:** The frontend `ReportType` interface has fields `{ report_type, label, description, filters }` which doesn't match the backend's `/reports/types` response `{ type, name, description }`. The backend returns `type` and `name` but the frontend expects `report_type` and `label`. The `filters` array also doesn't exist in the backend response, so `availableFilters` in `ReportGeneratorPage` (line 69) will always be an empty set -- meaning no filter UI (site, wave, sample type, etc.) will ever be shown.
**Fix:** Align the frontend `ReportType` interface to `{ type: string, name: string, description: string }` and add a `filters` array to the backend response, or hardcode filter availability per report type on the frontend.

### S-02: DashboardPage quick links use `<a>` tags instead of React Router `<Link>`
**File:** `frontend/src/pages/DashboardPage.tsx:170`
**Issue:** Quick links use raw `<a href="...">` which causes full page reloads instead of client-side navigation. This resets all React state (including auth store if not persisted) and creates a poor SPA experience.
**Fix:** Use `<Link to={link.href}>` from `react-router-dom`.

### S-03: Dashboard stat cards have inconsistent loading states
**File:** `frontend/src/pages/DashboardPage.tsx:78-79`
**Issue:** The `DashboardPage` shows `--` when loading and `+${data.enrollment.recent_30d}` when loaded. But if `data` is defined but `enrollment` is undefined (possible given the C-01 contract mismatch), `data.enrollment.recent_30d` will throw a TypeError.
**Fix:** Add optional chaining: `data?.enrollment?.recent_30d ?? 0`.

### S-04: `EnrollmentChart` component handles empty data but not undefined
**File:** `frontend/src/features/reports/EnrollmentDashboardPage.tsx:39-85`
**Issue:** The `EnrollmentChart` component checks `!data.length` but doesn't guard against `data` itself being undefined. The parent passes `data?.enrollment_over_time ?? []` so this is currently safe, but the typing could be tighter.
**Fix:** No code change needed -- just noting the defensive pattern is correctly applied at the call site.

### S-05: Query builder `filterIdCounter` is a module-level mutable counter -- not React-idiomatic
**File:** `frontend/src/features/reports/QueryBuilderPage.tsx:48`
**Issue:** `let filterIdCounter = 1` is a module-level mutable variable. In React strict mode (dev), components render twice, and in concurrent features, stale closures could reference old counter values. In practice this is low risk since the counter only increments, but using `useRef` or `useId` would be more idiomatic.
**Fix:** Use `useRef(1)` instead of a module-level variable.

### S-06: No error boundary on dashboard pages
**File:** `frontend/src/features/reports/EnrollmentDashboardPage.tsx`, `InventoryDashboardPage.tsx`, `QualityDashboardPage.tsx`
**Issue:** If any dashboard data accessor throws (e.g., `data.qc_pass_fail.passed` on undefined), the entire page crashes with an unhandled error. While each page has `isError` handling for failed API calls, runtime errors from malformed data are not caught.
**Fix:** Wrap dashboard pages in an ErrorBoundary component, or add more defensive optional chaining throughout.

### S-07: `_REPORT_DESCRIPTIONS` is disconnected from `ReportType` enum values
**File:** `backend/app/api/v1/reports.py:263-268`
**Issue:** The descriptions dict uses hardcoded string keys that must match `ReportType` enum values. If a new report type is added to the enum but not to the dict, it silently returns an empty description. Using `ReportType.ENROLLMENT_SUMMARY.value` as keys would prevent typos.
**Fix:** Key the dict by enum members: `{ ReportType.ENROLLMENT_SUMMARY: "...", ... }`.

### S-08: Quality dashboard SVG gradient `id="icc-gradient"` would conflict if two ICC rings render
**File:** `frontend/src/features/reports/QualityDashboardPage.tsx:110-113`
**Issue:** The SVG gradient uses a hardcoded `id="icc-gradient"`. If the component is ever rendered twice on the same page, both SVGs would reference the same gradient element, potentially causing visual issues in some browsers.
**Fix:** Use `useId()` to generate a unique gradient ID.

## Summary
- **5 critical** issues (complete frontend/backend API contract mismatch across all dashboards, wrong report payload shape, PDF/CSV type confusion, broken CSV export endpoint, 50K-row memory DoS)
- **10 important** issues (query builder field metadata missing, query response shape mismatch, schema type error, missing input validation on filters/cron/emails, sequential query performance, ILIKE escape ineffective, PII exposure)
- **8 suggestions** (frontend type mismatches, SPA navigation, defensive coding, code quality)

The most urgent fix is C-01 which affects every dashboard page -- none of the six dashboard views will render correctly because every frontend type is misaligned with the backend response. C-02 and C-03 together mean the report generator silently produces unfiltered reports that download as corrupted files. C-04 means CSV export is completely broken at runtime.
