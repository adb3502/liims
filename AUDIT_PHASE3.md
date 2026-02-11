# Phase 3 Devil's Advocate Audit Report

Auditor: Claude Opus 4.6
Date: 2026-02-12
Scope: Field operations, ODK integration, partner lab imports, stool kit tracker

---

## Critical Issues

### C-01: No CSV upload file-size limit — backend/app/api/v1/partner.py:188-191

**Description:** The `upload_csv` endpoint reads the entire uploaded file into memory with `content = await file.read()` without any size check. An authenticated user can upload a multi-GB file and OOM the server process.

**Impact:** Denial of service. Any ADMIN_LAB user can crash the backend by uploading a huge file.

**Fix:** Add `MAX_CSV_SIZE = 10 * 1024 * 1024` (10 MB). Check `len(content) > MAX_CSV_SIZE` immediately after `file.read()` and return 413. Alternatively, read in chunks up to the limit.

---

### C-02: Raw `text()` SQL with unsanitised table name assumption — backend/app/services/partner.py:234-239

**Description:** The `list_tests` method uses `text("similarity(canonical_test.canonical_name, :search) > 0.1")`. While the `:search` parameter is properly bound, the hardcoded table name `canonical_test` will break if the ORM table is named differently (e.g., `canonical_tests` plural) and is fragile against schema changes. More importantly, the `count_q` on lines 246-251 does **not** include the `search` filter, so the total count will be wrong when searching — the paginator shows more pages than actually exist.

**Impact:** Incorrect total count when searching canonical tests. Users see "Page 1 of 5" when results only fill 1 page.

**Fix:** Build the count query from the same filtered query (use `select(func.count()).select_from(query.subquery())` as done everywhere else), so the search condition is included in the count.

---

### C-03: N+1 query in `execute_import` — per-row participant lookup — backend/app/services/partner.py:563-584

**Description:** The `execute_import` method runs a `SELECT` with `pg_trgm` similarity matching **for every single row** of the CSV inside a loop. For a 5,000-row CSV, that is 5,000 sequential database round-trips using expensive trigram index scans.

**Impact:** Import of large partner lab files will be extremely slow (minutes to tens of minutes) and hold a database transaction open the entire time, blocking other operations.

**Fix:** Batch the matching: collect all unique `participant_code_raw` values, run a single query that matches them all at once (or in batches of ~500), then build a lookup dict. Same for the `preview_import` method (lines 452-464) which has the same per-row query pattern.

---

### C-04: ILIKE metacharacter injection in user search — backend/app/services/user.py:80-82

**Description:** The user service builds an ILIKE pattern `f"%{search}%"` without escaping `%`, `_`, or `\` metacharacters. A search for `%` returns all users; a search for `_` matches any single character. This was supposed to be fixed in Phase 2 audit (C-01) but the fix was only applied to `storage.py`, not `user.py`.

**Impact:** Data leak — any authenticated user can use ILIKE wildcards to enumerate all users.

**Fix:** Apply the same escape pattern used in `storage.py:832-838`:
```python
safe = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
pattern = f"%{safe}%"
```

---

### C-05: Stool kit status has no transition validation — backend/app/services/partner.py:736

**Description:** The `update_kit` method accepts any `StoolKitStatus` value without validating the transition. A kit can go from `issued` directly to `results_received`, or from `results_received` back to `issued`. This is unlike `FieldEvent` which has `VALID_STATUS_TRANSITIONS`.

**Impact:** Data integrity — kits can be set to invalid states, skipping required workflow steps. A kit could appear to have results without ever being collected.

**Fix:** Add a `VALID_KIT_TRANSITIONS` dict similar to `VALID_STATUS_TRANSITIONS` in `field_ops.py` and validate before applying the update.

---

## Important Issues

### I-01: Import preview shows wrong unmatched count — backend/app/services/partner.py:494-498

**Description:** `ImportPreviewResponse` sets `unmatched_rows = total_rows - matched_count`, but `total_rows` counts ALL rows in the CSV while `matched_count` only counts the first 20 preview rows. If a CSV has 1,000 rows and 15 of the first 20 match, the response says `unmatched_rows = 985` which is misleading.

**Fix:** Either clarify naming (`preview_matched_count` / `preview_unmatched_count`) or count matches only within the preview window: `unmatched_rows = len(preview_rows) - matched_count`.

---

### I-02: Duplicate `.params()` calls on same query — backend/app/services/partner.py:459-461, 580-582

**Description:** The query chains `.params(code=participant_code_raw)` twice (once after `.where()` and once after `.order_by()`). While SQLAlchemy merges them, this is confusing and one call may silently override the other if param names differ.

**Fix:** Call `.params(code=participant_code_raw)` once at the end of the query chain.

---

### I-03: `list_form_configs` has no pagination — backend/app/services/partner.py:61-65

**Description:** `list_form_configs` returns all form configs without pagination. While unlikely to be large now, it deviates from the pattern used everywhere else.

**Fix:** Add `page`/`per_page` parameters consistent with other list methods, or document that this is intentionally unpaginated because the count is expected to remain small.

---

### I-04: Frontend preview data shape mismatch — frontend/src/features/partners/ImportWizardPage.tsx:197-211

**Description:** The frontend reads `preview.matched`, `preview.unmatched`, and `preview.issues`, and `preview.sample_rows` — but the backend `ImportPreviewResponse` schema returns `matched_rows`, `unmatched_rows`, and `preview_rows`. The property names don't match, so the preview stats will all show `0` and no sample data will render.

**Fix:** Align the frontend to use the correct field names from the backend response: `preview.matched_rows`, `preview.unmatched_rows`, `preview.preview_rows`. There is no `issues` field — derive it or remove the display.

---

### I-05: `useUploadCsv` sends `partner_name` as form field but backend expects query param — frontend/src/api/partner.ts:139-146

**Description:** The upload mutation appends `partner_name` to the `FormData` body, but the backend route at `partner.py:184` declares `partner_name: PartnerName = Query(...)` — it expects a **query parameter**, not a form field. The upload will fail with a 422 validation error every time.

**Fix:** Send `partner_name` as a query parameter:
```ts
const res = await api.post(`/partner/imports/upload?partner_name=${partner_name}`, formData, ...)
```
Or change the backend to accept it from the form body.

---

### I-06: Missing `Content-Type` header override conflict — frontend/src/api/partner.ts:144

**Description:** Setting `Content-Type: multipart/form-data` explicitly prevents the browser from auto-generating the correct `boundary` parameter. Axios with `FormData` will set the correct header automatically.

**Fix:** Remove the explicit `headers: { 'Content-Type': 'multipart/form-data' }`. Let Axios handle it.

---

### I-07: `actual_participants` semantics inconsistent — backend/app/services/field_ops.py:242-246, 288-295, 354-358

**Description:** In `add_participants` (line 245), `actual_participants` counts ALL roster entries. In `check_in_participant` (line 294), it counts only those with `check_in_time IS NOT NULL`. In `bulk_digitize` (line 357), it counts ALL entries again. This means the number jumps between "total on roster" and "total checked in" depending on the last operation performed.

**Fix:** Decide on one consistent definition. If it means "checked-in count", always count by `check_in_time IS NOT NULL`. If it means "roster size", always count all. Probably should be two separate fields: `roster_count` and `checked_in_count`.

---

### I-08: `check_in_participant` does not send `participant_id` in request body correctly — backend/app/api/v1/field_events.py:154-172

**Description:** The check-in endpoint uses `CheckInRequest` which requires `participant_id`, but the frontend at `field-events.ts:117` sends `{ participant_id: participantId, ...data }`. This is correct, but `data` may contain `wrist_tag_issued: undefined` when only toggling one field (line 109), which will not be excluded by Pydantic. The check-in handler unconditionally overwrites both `wrist_tag_issued` and `consent_verified`, meaning toggling one checkbox sends the other as `undefined`, which could reset it.

**Impact:** Toggling wrist_tag_issued sends `consent_verified: undefined`. Since CheckInRequest has `consent_verified: bool = True`, the default kicks in, potentially re-setting consent_verified to True when user intended to set it False.

**Fix:** The frontend should always send both current values when toggling either field, or the backend should use `exclude_unset=True` pattern.

---

### I-09: `handleCheckIn` toggle logic is inverted per-field — frontend/src/features/field-ops/FieldEventDetailPage.tsx:105-114

**Description:** When toggling a field, the code sends `{ [field]: !participant[field] }`. But the check-in endpoint re-sets `check_in_time`, `wrist_tag_issued`, and `consent_verified` from the request body. Only the toggled field is sent, so the other boolean defaults to `True` (from the schema default). This means unchecking wrist_tag while consent is False will silently re-enable consent.

**Fix:** Send both field values explicitly:
```ts
data: {
  wrist_tag_issued: field === 'wrist_tag_issued' ? !participant.wrist_tag_issued : participant.wrist_tag_issued,
  consent_verified: field === 'consent_verified' ? !participant.consent_verified : participant.consent_verified,
}
```

---

### I-10: Stool kit `update_kit` old_values captures stale `decodeage_pickup_date` — backend/app/services/partner.py:738-740

**Description:** The audit log captures `old_values["decodeage_pickup_date"] = str(kit.decodeage_pickup_date)` on line 739, but `kit.status` has already been changed on line 736. If the `status` change triggers the auto-set of `results_received_at` (line 747), the old value of `results_received_at` is not captured in the audit log at all.

**Fix:** Capture all old values before making any mutations.

---

## Suggestions

### S-01: Extract `useDebounce` into a shared hook

The `useDebounce` function is duplicated in 4 files (`ParticipantListPage`, `SampleListPage`, `StorageSearchPage`, `SampleRegisterForm`). The one in `SampleRegisterForm.tsx:46` still incorrectly uses `useMemo` instead of `useEffect` (Phase 2 audit I-07 regression — was only fixed in some files). Extract to `@/hooks/useDebounce.ts` and fix the `useMemo` bug in `SampleRegisterForm`.

### S-02: Bulk digitize `check_in_time` sends as time string, not ISO datetime

In `BulkDigitizePage.tsx:107`, `check_in_time` is sent as `"14:30"` (a bare time string from the time input). The backend `BulkDigitizeItem` expects `datetime | None`. This will cause a Pydantic validation error. The frontend should construct a full ISO datetime by combining the event date with the time value.

### S-03: CSV path traversal — use UUID-only filenames

In `partner.py:376`, the safe filename is `f"{import_id}_{file_name}"`. While `file_name` comes from the original upload filename, on some platforms a malicious filename like `../../etc/passwd` could cause path traversal. The `os.path.join` helps, but safer to use UUID-only filenames: `f"{import_id}.csv"`.

### S-04: OdkFormConfig form_mapping JSON validation is silent

In `OdkSyncPage.tsx:264-268`, if the JSON is malformed the function just returns silently with no user feedback. Show a validation error message.

### S-05: Partners section has no RoleGuard in router.tsx

The `partners` route group (router.tsx:191-199) has no `RoleGuard` wrapper unlike `field-ops` and `admin`. Any authenticated user can access import/history/stool-kits pages. The backend has role checks, but the UI should prevent unauthorized navigation.

### S-06: `usePartnerResults` does not paginate

`usePartnerResults` (partner.ts:165-176) fetches partner results for a participant without pagination parameters. If a participant has hundreds of results, they are all loaded at once.

### S-07: `ImportHistoryPage` role check is wrong

In `ImportHistoryPage.tsx:56`, `canImport` allows `data_entry` role, but the backend `upload_csv` route only allows `ADMIN_LAB = (SUPER_ADMIN, LAB_MANAGER)`. Data entry users will see the "New Import" button but get 403 errors when clicking it.

### S-08: `list_form_configs` returns no `is_deleted` filter

`OdkService.list_form_configs` does not filter out soft-deleted records. If `OdkFormConfig` has an `is_deleted` column, deleted configs will appear in the list.

### S-09: Canonical test search count query is incorrect when both `search` and `category` are applied

In `CanonicalTestService.list_tests` (partner.py:246-251), the count query only filters by `category` (or `True` if no category). The `search` filter using `similarity()` is not included. When searching with a category filter, the count will be wrong.

### S-10: BulkDigitizePage bypasses same-day conflict check

`bulk_digitize` in `field_ops.py:311` auto-adds participants who aren't in the event yet (line 332-338) without the same-day conflict check that `add_participants` enforces (lines 198-216). A data entry user could inadvertently assign a participant to two same-day events through bulk digitization.

---

## Phase 2 Audit Fix Verification

| P2 Issue | Status | Notes |
|---|---|---|
| C-01 ILIKE escape | PARTIAL | Fixed in `storage.py:832-838`. Still unfixed in `user.py:80-82` (see C-04 above). |
| C-02 skip_locked removal | FIXED | No `skip_locked` usage found anywhere in codebase. |
| I-02 N+1 join | FIXED | `get_event` uses `selectinload`, roster uses explicit join. |
| I-04 freezer_id filter | FIXED | Storage queries properly filter by freezer_id. |
| I-05/I-06 off-by-one | FIXED | Pagination uses `(page - 1) * per_page` consistently. |
| I-07 useDebounce useMemo | PARTIAL | Fixed in `ParticipantListPage`, `SampleListPage`, `StorageSearchPage`. Still uses `useMemo` in `SampleRegisterForm.tsx:46` (see S-01). |

---

## Summary

| Severity | Count |
|---|---|
| Critical | 5 |
| Important | 10 |
| Suggestions | 10 |

**Top priority fixes:** C-01 (CSV size limit), C-03 (N+1 import), C-04 (ILIKE escape in user search), I-04/I-05 (frontend-backend API mismatch in import wizard), I-09 (check-in toggle bug).
