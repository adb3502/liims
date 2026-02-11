# Phase 4 Audit Report

## Critical Issues

### C-01: Frontend/Backend ICC schema mismatch -- frontend sends fields that backend rejects
**File:** `frontend/src/features/instruments/IccWorkflowPage.tsx:560-575`, `frontend/src/types/index.ts:931-936`, `backend/app/schemas/instrument.py:309-317`
**Issue:** The frontend `IccSlideCreate` interface has fields `slide_label` and `stain_panel`, but the backend `IccProcessingCreate` schema expects `fixation_reagent`, `antibody_panel`, `secondary_antibody`, etc. The frontend sends `{ sample_id, slide_label, stain_panel, notes }` but the backend will silently ignore `slide_label` and `stain_panel` (Pydantic v2 ignores extra fields by default unless `extra = "forbid"`) -- meaning the antibody_panel is never set. Additionally, the backend `IccProcessingRead` returns `antibody_panel`, `fixation_reagent`, `analysis_software`, `microscope_settings`, `image_file_paths`, `analysis_results` etc., but the frontend `IccSlide` type expects `slide_label`, `stain_panel`, `image_paths`, `cell_counts`, `imaging_datetime` -- fields that don't exist in the backend response. This means the entire ICC detail drawer will render `undefined` for most fields, and the kanban cards will never show `stain_panel`.
**Fix:** Align the frontend `IccSlide` and `IccSlideCreate` types to match the backend `IccProcessingRead` and `IccProcessingCreate` schemas. Map `antibody_panel` to the UI's "Stain Panel" concept, and remove non-existent fields like `slide_label`, `imaging_datetime`, `image_paths`, `cell_counts`.

### C-02: Complete/Fail run API contract mismatch -- frontend sends body but backend expects query param
**File:** `frontend/src/api/instruments.ts:233-245`, `backend/app/api/v1/instruments.py:353-369`
**Issue:** The frontend `useCompleteRun` sends a POST body `{ qc_status, notes }` to `/instruments/runs/{id}/complete`. However, the backend `complete_run` endpoint only accepts a query parameter `failed: bool = Query(False)` -- it does NOT accept a request body. The `qc_status` and `notes` fields are completely ignored by the backend. The `FailRunDialog` (line 470) sends `{ qc_status: 'failed', notes: ... }` thinking this marks the run as failed, but since the body is ignored, the run is actually completed as successful (failed=False by default). This is a data corruption bug.
**Fix:** Either (a) add a request body schema to the backend `complete_run` endpoint that accepts `{ failed, qc_status, notes }`, or (b) change the frontend to send `?failed=true` as a query parameter for the fail case. The complete dialog should also pass qc_status via the update endpoint separately.

### C-03: Upload results API contract mismatch -- frontend sends wrong shape
**File:** `frontend/src/api/instruments.ts:247-258`, `backend/app/schemas/instrument.py:262-268`
**Issue:** The frontend `useUploadRunResults` sends `{ results: Array<{ sample_id, data }> }` but the backend `RunResultsUpload` schema expects `{ result_type, results: Array<{ sample_id, feature_id, feature_name, quantification_value, is_imputed, confidence_score }> }`. The `result_type` field is **required** (no default) and `data` is not a valid field. Every upload attempt will fail with a 422 validation error since `result_type` is missing and the results items don't have `feature_id`.
**Fix:** Update the frontend `useUploadRunResults` mutation and the `UploadResultsDialog` to send the correct shape including `result_type` and properly structured result items.

### C-04: N+1 query in RunService.list_runs -- 3 extra queries per run
**File:** `backend/app/services/instrument.py:728-731`, `backend/app/services/instrument.py:961-1003`
**Issue:** `list_runs` calls `self._run_dict(run)` for each run in the result set. `_run_dict` executes 3 separate queries per run (instrument name, plate count, sample count). For a page of 20 runs, this is 60 additional queries. This will cause significant latency as the data grows.
**Fix:** Replace the N+1 pattern with a single query using JOINs and subquery aggregation. For example:
```python
query = (
    select(InstrumentRun, Instrument.name,
           func.count(distinct(Plate.id)),
           func.count(distinct(InstrumentRunSample.id)))
    .outerjoin(Instrument, InstrumentRun.instrument_id == Instrument.id)
    .outerjoin(Plate, Plate.run_id == InstrumentRun.id)
    .outerjoin(InstrumentRunSample, InstrumentRunSample.run_id == InstrumentRun.id)
    .group_by(InstrumentRun.id, Instrument.name)
)
```

### C-05: Missing `is_deleted` filter on Plate queries
**File:** `backend/app/services/instrument.py:183`, `backend/app/services/instrument.py:202-206`
**Issue:** The `list_plates` and `get_plate` methods do not filter by `is_deleted == False`. While the Plate model may not have an `is_deleted` column currently, this is inconsistent with the project's soft-delete pattern used for Instruments, Runs, and Samples. If a soft-delete column is ever added (it should be), all existing plate queries will return deleted records. Additionally, `get_plate_grid` and `generate_tecan_worklist` also lack this filter.
**Fix:** Add `Plate.is_deleted == False` filters if the column exists, or add the `is_deleted` column to the Plate model to maintain consistency.

## Important Issues

### I-01: `random.shuffle` is not cryptographically secure and not seeded for reproducibility
**File:** `backend/app/services/instrument.py:427-439`
**Issue:** The plate randomization uses `random.shuffle` which is seeded from system entropy. For scientific reproducibility, the randomization seed should be recorded so the same layout can be regenerated. The `randomization_config` stored on the plate (line 442) does not include the random seed.
**Fix:** Generate a seed with `random.randint(0, 2**32)`, store it in `randomization_config`, and use `random.Random(seed)` for the shuffle so the layout is reproducible.

### I-02: Row label generation breaks for plates with >26 rows
**File:** `backend/app/services/instrument.py:366-368`, `frontend/src/features/instruments/PlateDetailPage.tsx:93-97`
**Issue:** Well position labels use `chr(ord("A") + r)` which works for rows 0-25 (A-Z) but produces non-standard characters for rows >= 26 (e.g., row 26 = `[`, row 27 = `\`). The `PlateCreate` schema allows up to 32 rows. This would generate invalid well positions like `[1`, `\\2`.
**Fix:** Use double-letter labels (AA, AB, etc.) for rows > 25, or limit `rows` to `le=26` in the schema.

### I-03: ICC advance_status uses `next(iter(allowed))` on a set -- non-deterministic
**File:** `backend/app/services/icc.py:205`
**Issue:** `next(iter(allowed))` iterates a Python `set`, which has no guaranteed order. While the `_ICC_TRANSITIONS` dict maps each status to at most one forward transition (so the set has exactly one element), this is fragile. If someone adds a rollback transition (as the comment on line 30 suggests), `iter()` on a set could pick the wrong transition.
**Fix:** Change to use a deterministic data structure (list or ordered tuple) for the transition targets, or explicitly filter for the forward transition.

### I-04: TECAN CSV worklist is vulnerable to CSV injection
**File:** `backend/app/services/instrument.py:598-607`
**Issue:** `generate_tecan_csv` writes values directly into CSV without escaping. While the current values are controlled (rack names, positions, volumes), if any field contains a comma, newline, or starts with `=`, `+`, `-`, `@`, it could break the CSV format or enable formula injection in spreadsheet software that opens the file.
**Fix:** Use Python's `csv.writer` instead of manual string concatenation to properly escape values.

### I-05: Plate well assignment does not check for duplicate well positions
**File:** `backend/app/services/instrument.py:279-338`
**Issue:** The `assign_wells` method does not check if the requested `well_position` values are already occupied on the plate. Multiple samples could be assigned to the same well position (e.g., two assignments for "A1"), corrupting the plate layout. The same issue exists in `randomize_plate` -- it doesn't clear existing well assignments before adding new ones.
**Fix:** Before inserting, query existing well assignments for the plate and reject assignments with conflicting positions. For `randomize_plate`, either clear existing assignments or check that the plate has no existing assignments.

### I-06: IccWorkflowPage fetches all 200 slides without pagination
**File:** `frontend/src/features/instruments/IccWorkflowPage.tsx:198`
**Issue:** `useIccSlides({ per_page: 200 })` loads up to 200 ICC records in a single request for the kanban view. As the lab scales, this will become a performance bottleneck. There is no server-side pagination for the kanban board.
**Fix:** Either implement virtual scrolling within columns, or use server-side grouping (e.g., separate queries per status column with individual pagination).

### I-07: InstrumentDashboardPage search is client-side only
**File:** `frontend/src/features/instruments/InstrumentDashboardPage.tsx:178-189`
**Issue:** The search input filters instruments client-side on the current page only (`items.filter(...)`). If the user searches for "Hamilton" but that instrument is on page 3, it won't be found. The backend already supports a `search` parameter, but it's never passed in `queryParams`.
**Fix:** Include `search: debouncedSearch || undefined` in the `queryParams` sent to `useInstruments`, similar to how `InstrumentRunsPage` handles it (though that one also has the same client-side-only bug).

### I-08: InstrumentRunsPage search is client-side only
**File:** `frontend/src/features/instruments/InstrumentRunsPage.tsx:82-91`, `frontend/src/features/instruments/InstrumentRunsPage.tsx:116-126`
**Issue:** Same as I-07. The `debouncedSearch` value is never included in `queryParams` sent to the server. The `useRuns` hook only gets `page, per_page, instrument_id, run_type, status`. The backend `list_runs` supports a `search` parameter that is never used.
**Fix:** Add `search: debouncedSearch || undefined` to `queryParams`.

### I-09: Missing `db.commit()` in all service methods -- relies on implicit session management
**File:** `backend/app/services/instrument.py` (all service methods), `backend/app/services/icc.py` (all service methods)
**Issue:** No service method calls `await self.db.commit()`. This relies on the caller (or middleware) to commit the session. If the middleware or endpoint handler doesn't call commit, all changes will be lost. The `flush()` calls push changes to the DB transaction but don't commit. While this may be handled by a session middleware/dependency that auto-commits, it should be explicitly documented or validated.
**Fix:** Verify that the `get_db` dependency commits on success. If it does, this is fine but should be documented. If it doesn't, add explicit commits in service methods.

### I-10: `run_name.ilike()` will fail with NullPointerException-equivalent when run_name is NULL
**File:** `backend/app/services/instrument.py:715`
**Issue:** `InstrumentRun.run_name.ilike(f"%{safe}%")` will correctly match against NULL columns in PostgreSQL (NULL ILIKE '%x%' is NULL, which is falsy), so this is technically safe. However, this inconsistency means searching will never match runs with NULL run_name even if they have matching batch_ids or other fields. The search only targets `run_name`.
**Fix:** Consider extending the search to also match against `batch_id` and `method_name` using an OR clause.

## Suggestions

### S-01: RunDetailPage references `run.plates` and `run.run_samples` but backend doesn't return them
**File:** `frontend/src/features/instruments/RunDetailPage.tsx:239-269`, `frontend/src/features/instruments/RunDetailPage.tsx:272-327`
**Issue:** The `RunDetailPage` renders `run.plates` and `run.run_samples` from the `RunDetail` type, but the backend `_run_dict` method (line 961-1003) only returns scalar counts (`plate_count`, `sample_count`) -- not the actual plate and sample arrays. These sections will always render as empty ("No plates linked") even when plates exist.
**Fix:** Either extend the backend `get_run` endpoint to include the actual plates and run_samples data, or add separate API calls on the frontend to fetch plates by `run_id` and run_samples.

### S-02: PlateDesignerPage preview grid always shows empty wells
**File:** `frontend/src/features/instruments/PlateDesignerPage.tsx:98-160`
**Issue:** The `PlatePreviewCard` expandable grid shows all wells as empty (line 134-138 always uses `WELL_COLORS.empty`). It never fetches actual well assignment data for the plate. The grid/detail endpoint exists but isn't used here.
**Fix:** Optionally fetch plate grid data when expanded, or use the plate detail API to color-code occupied wells.

### S-03: Consider adding `format` query parameter to `useIccSlides` hook signature
**File:** `frontend/src/api/instruments.ts:262-270`
**Issue:** `useIccSlides` doesn't pass the `participant_id` parameter that the backend supports. This limits the ability to filter ICC records by participant from the frontend.
**Fix:** Add `participant_id` to the parameter type.

### S-04: QC well placement uses first sample's ID as placeholder -- misleading data
**File:** `backend/app/services/instrument.py:458`
**Issue:** QC wells are created with `sample_id=shuffled_samples[0].id` as a "placeholder". This means QC wells reference a real sample, which could confuse downstream analysis or result in incorrect associations. Any query filtering by sample_id will incorrectly include QC well records.
**Fix:** Either use a dedicated sentinel UUID for QC wells, make `sample_id` nullable for QC wells, or add a dedicated QC sample record.

### S-05: Unused import in RunDetailPage
**File:** `frontend/src/features/instruments/RunDetailPage.tsx:77`
**Issue:** `uploadMutation` is declared at the top of `RunDetailPage` but never used within that component (it's used inside `UploadResultsDialog` which creates its own instance).
**Fix:** Remove the unused `useUploadRunResults(id!)` call.

### S-06: Missing `key` prop on React Fragment in PlateDesignerPage
**File:** `frontend/src/features/instruments/PlateDesignerPage.tsx:122-139`
**Issue:** The `rowLabels.map` uses `<>...</>` (Fragment) as the outer element but the `key` is set on the `<div>` inside it (line 125). React requires the key on the outermost element returned from `map`. This will generate a React warning.
**Fix:** Use `<Fragment key={...}>` (imported) or `<React.Fragment key={...}>` instead of `<>`.

### S-07: Consider debouncing instrument search on dashboard
**File:** `frontend/src/features/instruments/InstrumentDashboardPage.tsx:157`
**Issue:** The instrument dashboard search filters on every keystroke (no debounce). While this is client-side filtering and fast for small datasets, adding a debounce would be good practice if server-side search is added per I-07.
**Fix:** Add `useDebounce(searchInput, 300)` like the runs page does.

### S-08: Omics results feature_id search should support exact match option
**File:** `backend/app/services/instrument.py:1065-1067`
**Issue:** The `feature_id` filter uses ILIKE with wildcards (`%{safe}%`), meaning searching for "PROT1" also matches "PROT10", "PROT11", etc. For omics data, exact feature ID matching is often needed.
**Fix:** Add an `exact` query parameter that switches between ILIKE and exact match.

## Summary
- **5 critical** issues (3 API contract mismatches causing data loss/broken features, 1 N+1 query, 1 missing soft-delete filter)
- **10 important** issues (reproducibility, CSV injection, duplicate wells, performance, missing server-side search)
- **8 suggestions** (missing data in detail views, UX improvements, code quality)

The most urgent fixes are C-01, C-02, and C-03 which represent complete frontend/backend disconnects -- the ICC workflow page, run completion, and results upload are all functionally broken due to schema/API mismatches.
