# Phase 2 Audit Report

**Auditor:** Devil's Advocate Auditor
**Date:** 2026-02-12
**Scope:** Phase 2 (Storage Management + QR Codes) code and Phase 1 audit fixes
**Files reviewed:** 18

---

## Critical Issues

> MUST FIX before any deployment. These are security vulnerabilities, data-loss risks, or bugs that will cause runtime failures.

### C-01: SQL Injection via ILIKE in `search_storage`

**File:** `backend/app/services/storage.py:847`

```python
Sample.sample_code.ilike(f"%{sample_code}%"),
```

The `sample_code` parameter from the query string is interpolated directly into an ILIKE pattern. While SQLAlchemy parameterizes the value itself, the `%` wildcards are part of the pattern string. A user can inject LIKE metacharacters:
- Input `%` returns ALL stored samples (information disclosure)
- Input `_` matches any single character
- Input `%%%%%%%%%%` could cause regex/pattern-matching performance issues

More importantly, this is an **unbounded query** -- there is no `LIMIT` clause. Searching `%` returns every stored sample row joined across 4 tables, potentially thousands of rows, causing memory and performance issues.

**Fix:** Escape LIKE metacharacters in the input (`%` -> `\%`, `_` -> `\_`), and add a `LIMIT` (e.g., 50) to bound the result set. Consider requiring a minimum input length (already enforced at API level with `min_length=1`, but `%` passes that check).

---

### C-02: `skip_locked=True` Silently Returns None for Contended Rows

**File:** `backend/app/services/storage.py:439-446`

```python
result = await self.db.execute(
    select(StoragePosition)
    .where(StoragePosition.id == position_id)
    .with_for_update(skip_locked=True)
)
position = result.scalar_one_or_none()
if position is None:
    raise ValueError("Storage position not found.")
```

`SKIP LOCKED` causes the query to silently skip rows that are locked by another transaction. If two requests try to assign to the same position concurrently, the second request gets `None` back -- **not because the position doesn't exist**, but because it's locked. The error message `"Storage position not found"` is misleading and confusing.

Worse, the same pattern in `unassign_sample` (line 500) means concurrent unassign requests will silently report "position not found" instead of a proper concurrency error.

**Fix:** Use `with_for_update(nowait=True)` instead and catch the database lock exception to return an explicit "Position is currently being modified, please retry" error. Alternatively, use plain `with_for_update()` (blocking) with a short timeout.

---

### C-03: `auto_assign_sample` Has a TOCTOU Race Condition

**File:** `backend/app/services/storage.py:581-597`

```python
async def auto_assign_sample(self, ...):
    box = await self.find_available_box(freezer_id, group_code)  # Step 1
    position = await self.find_available_position(box.id)        # Step 2
    return await self.assign_sample(position.id, ...)            # Step 3
```

Between step 2 (finding available position) and step 3 (assigning it), another concurrent request can claim the same position. While `assign_sample` uses `SKIP LOCKED`, per C-02, the locked row silently disappears, giving a misleading "position not found" error. Moreover, `find_available_position` does NOT use `SELECT FOR UPDATE`, so multiple concurrent auto-assign calls will all find the same "first available" position.

**Fix:** `find_available_position` should use `with_for_update(skip_locked=True)` to atomically find AND lock the position. Better yet, combine the find + assign into a single query that selects the first available position with `FOR UPDATE SKIP LOCKED`.

---

### C-04: `consolidate_box` Is Not Atomic -- Partial Moves on Failure

**File:** `backend/app/services/storage.py:670-680`

```python
for src_pos in occupied:
    sample_id = src_pos.sample_id
    await self.unassign_sample(src_pos.id, consolidated_by)
    target_pos = await self.find_available_position(target_box_id)
    if target_pos is None:
        raise ValueError("Ran out of target positions during consolidation.")
    await self.assign_sample(target_pos.id, sample_id, consolidated_by)
    moved_count += 1
```

If an error occurs mid-loop (e.g., at iteration 15 of 30), the first 14 samples have been moved and the 15th has been unassigned from source but NOT assigned to target. The sample is now in limbo: its `storage_location_id` is `None` but it's not in any position. The caller gets a 400 error with no indication of which samples were moved and which weren't.

While the database transaction should roll back on unhandled exception, the `ValueError` at line 678 IS handled by the API route (caught and returned as 400). If the route doesn't explicitly roll back, partial state could be committed.

**Fix:** Verify that the API route wraps this in a transaction that rolls back on any ValueError. The current pattern relies on the implicit session commit at the end of the request -- ensure no auto-commit happens before the full operation completes. Add an explicit check that target capacity is sufficient BEFORE starting the loop (already done at line 664, but verify the count is accurate given concurrent access).

---

### C-05: `FreezerUpdate` Schema Allows Setting `rows`/`columns` via `BoxUpdate` Mismatch

**File:** `backend/app/schemas/storage.py:94-101`

```python
class BoxUpdate(BaseModel):
    box_name: str | None = None
    box_label: str | None = None
    box_type: BoxType | None = None
    box_material: BoxMaterial | None = None
    position_in_rack: int | None = None
    group_code: str | None = None
    collection_site_id: uuid.UUID | None = None
```

`BoxUpdate` correctly excludes `rows` and `columns` from updates (changing grid size after positions are created would be a data integrity disaster). However, the `update_box` service method (line 397) uses `data.model_dump(exclude_unset=True)` and blindly applies `setattr(box, field, value)` for ALL fields. If someone adds `rows` or `columns` to `BoxUpdate` in the future, the grid will resize without recreating positions, leaving orphaned or missing positions.

This is not a bug TODAY, but the `update_freezer` method at line 138 uses the same pattern with `FreezerUpdate`, which DOES allow updating `rack_count` and `slots_per_rack` -- these are informational fields that don't control actual data, so it's fine. But the pattern is fragile.

**Severity downgraded from Critical to Important** since `BoxUpdate` currently prevents this.

---

## Important Issues

> SHOULD FIX. Functional bugs, missing validation, performance problems, or security weaknesses that aren't immediately exploitable but will cause problems.

### I-01: N+1 Query in `list_freezers` Utilization Calculation

**File:** `backend/app/services/storage.py:73-77`

```python
items = []
for f in freezers:
    stats = await self._freezer_utilization(f.id)
    items.append({**self._freezer_dict(f), **stats})
```

`_freezer_utilization` executes 2 COUNT queries per freezer (total positions + used positions). For a page of 20 freezers, this is 40 additional queries. With 50 freezers per page (as configured in the frontend `PER_PAGE = 50`), that's 100 queries per page load.

**Fix:** Replace the loop with a single aggregate query that joins `Freezer -> Rack -> Box -> Position` and groups by `freezer.id` to compute `total_positions` and `used_positions` in one round trip.

---

### I-02: N+1 Query in `get_box_detail` for Sample Codes

**File:** `backend/app/services/storage.py:316-319`

```python
for pos in sorted(box.positions, key=lambda p: (p.row, p.column)):
    sample_code = None
    if pos.sample_id:
        s_result = await self.db.execute(
            select(Sample.sample_code).where(Sample.id == pos.sample_id)
        )
        sample_code = s_result.scalar_one_or_none()
```

For an 81-slot box that's fully occupied, this executes 81 individual SELECT queries to fetch sample codes. A 10x10 box (cryo_100) generates 100 queries.

**Fix:** Use `selectinload` on the Sample relationship, or batch-fetch all sample codes in a single `WHERE sample_id IN (...)` query before the loop.

---

### I-03: `list_boxes` Post-Filtering Breaks Pagination

**File:** `backend/app/services/storage.py:278-295`

```python
for box in boxes:
    occupied = await self._box_occupied_count(box.id)
    total_slots = box.rows * box.columns
    if has_space is True and occupied >= total_slots:
        continue
    if has_space is False and occupied < total_slots:
        continue
    items.append(...)

if has_space is not None:
    total = len(items)
```

The `has_space` filter is applied AFTER pagination (`OFFSET/LIMIT`). This means:
1. Page 1 returns boxes 1-20, then filters some out -> page may have fewer items than `per_page`
2. The `total` is set to `len(items)` (filtered items on THIS page only), not the actual total matching the filter
3. Client pagination breaks: page 2 may skip items that were filtered out on page 1

Additionally, each box in the loop calls `_box_occupied_count` (another N+1 query pattern -- 20 queries for 20 boxes).

**Fix:** Push the `has_space` filter into SQL using a subquery that counts occupied positions per box and filters at the database level. This also eliminates the N+1 problem for occupied counts.

---

### I-04: `FreezerDetailPage` Fetches ALL Boxes Without Freezer Filter

**File:** `frontend/src/features/storage/FreezerDetailPage.tsx:89`

```tsx
const { data: boxes } = useBoxes({ rack_id: undefined, per_page: 100 })
```

This fetches ALL boxes in the entire system (up to 100) instead of only boxes belonging to this freezer's racks. The `useBoxes` hook passes `rack_id: undefined`, which means no rack filter is applied. The code then client-side filters them by rack:

```tsx
rackBoxMap[rack.id] = boxes.data.filter((b) => b.rack_id === rack.id)
```

This is both a performance issue (fetching 100 boxes across all freezers) and a correctness issue (if there are more than 100 boxes, some of this freezer's boxes may be missing).

**Fix:** Either make separate `useBoxes({ rack_id: rackId })` calls per rack, or add a `freezer_id` filter parameter to the boxes API endpoint.

---

### I-05: `BoxDetailPage` Grid Indexing Is Off-by-One

**File:** `frontend/src/features/storage/BoxDetailPage.tsx:111`

```tsx
if (pos.row >= 0 && pos.row < box.rows && pos.column >= 0 && pos.column < box.columns) {
    g[pos.row][pos.column] = pos
}
```

The backend creates positions with 1-based row/column indices (line `storage.py:418-419`: `for r in range(1, box.rows + 1)`), but the grid array is 0-based. Position at row=1, column=1 would be placed at `g[1][1]`, skipping `g[0][0]`. Position at row=9, column=9 would try to access `g[9][9]` which is out of bounds for a 9-element array (indices 0-8).

This means: the first row and first column of the grid will always appear empty, and the last row/column positions will be silently dropped (out of bounds).

**Fix:** Map positions using `g[pos.row - 1][pos.column - 1]` to convert from 1-based database indices to 0-based array indices.

---

### I-06: `AssignSampleDialog` Position Label Is Wrong Due to Same Off-by-One

**File:** `frontend/src/features/storage/BoxDetailPage.tsx:384`

```tsx
const posLabel = `${String.fromCharCode(65 + position.column)}${position.row + 1}`
```

Since positions are 1-based, `position.column = 1` produces `String.fromCharCode(66)` = `"B"`, and `position.row = 1` produces `2`. So position (1,1) displays as "B2" instead of "A1". The same bug exists in `OccupiedCellDialog` at line 443 and `StorageResultCard` at line 110 of `StorageSearchPage.tsx`.

**Fix:** Use `String.fromCharCode(65 + position.column - 1)` and `position.row` (no +1). Or consistently subtract 1 from both.

---

### I-07: `StorageSearchPage` Uses Broken `useDebounce` with `useMemo`

**File:** `frontend/src/features/storage/StorageSearchPage.tsx:16-23`

```tsx
function useDebounce(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value)
  useMemo(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}
```

This is the EXACT same bug from Phase 1 audit (C-07) that was fixed in `ParticipantListPage` and `SampleListPage` by switching to `useEffect`, but the NEW `StorageSearchPage` introduces a fresh copy of the buggy version. The cleanup function is returned as the memoized value (ignored) instead of being called on dependency change. Timers accumulate without clearing.

**Fix:** Replace `useMemo` with `useEffect`, matching the fix already applied to the other two pages.

---

### I-08: `deactivate_freezer` Does Not Check for Stored Samples

**File:** `backend/app/services/storage.py:157-183`

A freezer can be soft-deleted (`is_deleted=True`, `is_active=False`) even if it contains racks with boxes that have samples stored in them. This orphans the storage location references on those samples -- `sample.storage_location_id` still points to a position in a deleted freezer, and the storage search will fail to find them because the `Freezer.is_deleted` filter excludes it from the join.

**Fix:** Before deactivating, check if any positions in the freezer's rack->box hierarchy have `sample_id IS NOT NULL`. If so, either reject the deactivation or require the user to relocate samples first.

---

### I-09: QR Batch Endpoint Missing Size Limit on Image Generation

**File:** `backend/app/services/qr_code.py:50-58` and `backend/app/api/v1/qr.py:60-82`

The batch QR endpoint accepts up to 200 sample IDs (schema limit `max_length=200`). Each QR image is generated synchronously in a loop using PIL, then compressed into a ZIP in memory. For 200 images, this means:
- 200 QR code generations (CPU-bound PIL operations)
- All images held in memory simultaneously
- The entire ZIP assembled in an `io.BytesIO` buffer
- A single request blocking the async event loop for the duration of all 200 image generations

This is a **denial-of-service vector**: a single authenticated user can tie up a worker process for many seconds by requesting 200 QR codes.

**Fix:** Offload batch QR generation to a Celery task. Return a task ID and let the client poll for completion. Alternatively, set a lower batch limit (e.g., 50) and generate images in a thread pool executor (`asyncio.to_thread`).

---

### I-10: `auto_create_racks` Audit Log Records Only First Rack ID

**File:** `backend/app/services/storage.py:242-249`

```python
self.db.add(AuditLog(
    id=uuid.uuid4(),
    user_id=created_by,
    action=AuditAction.CREATE,
    entity_type="storage_rack",
    entity_id=racks[0].id if racks else None,
    new_values={"batch_count": count, "freezer_id": str(freezer_id)},
))
```

When batch-creating 20 racks, only the first rack's ID is recorded in the audit log. The other 19 rack creations are unaudited. For a system where audit trail completeness matters (regulatory compliance), this is a gap.

**Fix:** Either log all rack IDs in the `new_values` dict (e.g., `"rack_ids": [str(r.id) for r in racks]`), or create an audit log entry per rack.

---

### I-11: `FreezerUpdate` Schema Does Not Validate `name` Length

**File:** `backend/app/schemas/storage.py:23-30`

```python
class FreezerUpdate(BaseModel):
    name: str | None = None
    ...
```

`FreezerCreate` has `name: str = Field(min_length=1, max_length=100)`, but `FreezerUpdate` has no length validation on `name`. A user could update a freezer name to an empty string `""` or a string exceeding the database column limit (100 chars), causing either a bad data state or a database constraint error (unhandled 500).

The same issue exists in `BoxUpdate` -- no validation on `box_name` length, while `BoxCreate` has `min_length=1, max_length=100`.

**Fix:** Add `Field(min_length=1, max_length=100)` to update schemas for name fields, or at minimum validate `max_length` to match the DB column.

---

## Suggestions

> NICE TO HAVE. Code quality, performance optimizations, developer experience improvements.

### S-01: Missing Uniqueness Constraint on `(freezer_id, rack_name)`

**File:** `backend/app/models/storage.py:105-107`

Two racks in the same freezer can have the same `rack_name`. The `auto_create_racks` method generates names like `R1`, `R2`, etc., but a subsequent call with the same prefix will create duplicates. There's no unique constraint preventing `R1` from appearing twice in the same freezer.

**Fix:** Add `UniqueConstraint("freezer_id", "rack_name", name="uq_rack_freezer_name")` to the `StorageRack` model.

---

### S-02: Missing Uniqueness Constraint on `(rack_id, box_name)`

**File:** `backend/app/models/storage.py:137-140`

Same issue as S-01 but for boxes within a rack. Two boxes can have identical names in the same rack.

**Fix:** Add `UniqueConstraint("rack_id", "box_name", name="uq_box_rack_name")`.

---

### S-03: QR Code Font Fallback Chain Is Fragile

**File:** `backend/app/services/qr_code.py:31-37`

```python
try:
    font = ImageFont.truetype("arial.ttf", 16)
except OSError:
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 16)
    except OSError:
        font = ImageFont.load_default()
```

The font lookup tries Windows (`arial.ttf`), then a hardcoded Linux path, then falls back to PIL's default bitmap font (which looks very different and may not render well). In Docker (Linux), `arial.ttf` won't exist. The DejaVu path may vary by distro.

**Fix:** Bundle a specific font file with the project, or install `fonts-dejavu` in the Docker image and use a reliable path.

---

### S-04: `CreateFreezerDialog` Does Not Reset Form on Close

**File:** `frontend/src/features/storage/FreezerListPage.tsx:302-390`

If the user opens the dialog, types a name, closes without submitting, then reopens, the previous values persist in state. While React will destroy and recreate the component (because of the `{showCreateDialog && ...}` pattern), this depends on the conditional rendering always unmounting. If the dialog is refactored to use `open` prop without conditional mount, stale state will appear.

Same pattern exists for `AddRackDialog`, `BatchRacksDialog`, and `AddBoxDialog`.

---

### S-05: Grid Column Headers Break After 26 Columns

**File:** `frontend/src/features/storage/BoxDetailPage.tsx:164-166`

```tsx
const colHeaders = Array.from({ length: box.columns }, (_, i) =>
    String.fromCharCode(65 + i)
)
```

For `box.columns > 26`, `String.fromCharCode(91)` is `[`, not `AA`. The schema allows up to 20 columns (`le=20`), so this is safe currently, but the code doesn't handle the edge case and will silently produce non-letter characters if the schema limit is raised.

---

### S-06: Temperature Events View Has No Pagination

**File:** `frontend/src/features/storage/FreezerDetailPage.tsx:90`

```tsx
const { data: tempData } = useTempEvents(id!, { per_page: 20 })
```

Only the first 20 temperature events are fetched and displayed. There's no pagination UI in the `TemperatureEventsView` component. If a freezer has more than 20 events, older ones are invisible.

**Fix:** Add pagination controls to the temperature events tab, similar to the freezer list page.

---

### S-07: `useAssignSample` and `useUnassignSample` Don't Invalidate Box Detail

**File:** `frontend/src/api/storage.ts:352-354`

```typescript
onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: storageKeys.boxes() })
    queryClient.invalidateQueries({ queryKey: storageKeys.freezers() })
}
```

After assigning/unassigning a sample, the `boxes()` and `freezers()` list queries are invalidated, but the **box detail** query (`storageKeys.boxDetail(boxId)`) is not explicitly invalidated. The user is likely viewing the `BoxDetailPage` when performing this action, and the grid won't update unless TanStack Query's stale-time triggers a refetch.

**Fix:** Also invalidate `storageKeys.boxDetail(boxId)` in the onSuccess callback. This requires passing the `boxId` to the hook.

---

## Phase 1 Audit Fix Review

> Reviewing the fixes applied for Phase 1 audit findings.

### C-01 Fix (CORS): VERIFIED GOOD

**File:** `backend/app/main.py:40-44` + `backend/app/config.py:24`

CORS now uses `settings.CORS_ORIGINS` (a `list[str]` with explicit defaults). The wildcard `*` is gone.

### C-02 Fix (SECRET_KEY): VERIFIED GOOD

**File:** `backend/app/main.py:16-21`

Startup check raises `RuntimeError` if `SECRET_KEY` is the default in non-debug mode.

### C-03 Fix (Session Revocation): VERIFIED GOOD

**File:** `backend/app/core/deps.py:48-60`

Session is now verified via `token_hash` lookup against `UserSession` table. Revoked sessions correctly return 401.

### C-04 Fix (Route Ordering): VERIFIED GOOD

**File:** `backend/app/api/v1/samples.py:108-147`

Discard-request routes are now declared BEFORE the `/{sample_id}` routes with a clear comment.

### C-05 Fix (XSS): VERIFIED GOOD

**File:** `backend/app/core/email.py:59-60`

`html.escape()` is applied to both `title` and `message` before HTML interpolation.

### C-06 Fix (Sort Allowlist): VERIFIED GOOD

**Files:** `backend/app/services/participant.py:107-110`, `backend/app/services/sample.py:229-232`

Both services now have explicit `ALLOWED_SORTS` sets and validate the sort column.

### C-07 Fix (useDebounce): VERIFIED GOOD -- BUT INCOMPLETE

**Files:** `ParticipantListPage.tsx:32-36`, `SampleListPage.tsx:82-87`

Both pages correctly use `useEffect` instead of `useMemo`. **However**, the new `StorageSearchPage.tsx` introduces a fresh copy of the buggy `useMemo` version (see I-07 above).

### I-01 Fix (Auth /me): VERIFIED GOOD

**File:** `frontend/src/stores/auth.ts:66-69`

`response.data.data` is now used correctly without the spurious `.user` access.

---

## Summary

### By Severity

| Severity | Count | Description |
|----------|-------|-------------|
| **Critical** | 4 | Race conditions, ILIKE injection, partial consolidation failure |
| **Important** | 11 | N+1 queries, off-by-one grid bug, broken debounce, missing validation |
| **Suggestion** | 7 | Missing constraints, font issues, cache invalidation, pagination gaps |

### Top Priorities (Fix Immediately)

1. **I-05 + I-06: Off-by-one grid indexing** -- The box grid is completely broken: positions render in wrong cells, first row/column always empty, last row/column dropped. This makes the BoxDetailPage unusable.
2. **I-07: Broken useDebounce in StorageSearchPage** -- Same bug that was fixed in Phase 1 was reintroduced in new code. Memory leak and broken debounce behavior.
3. **C-02 + C-03: Race conditions in assign/auto-assign** -- `SKIP LOCKED` silently swallows contention, and auto-assign has TOCTOU issues. Under concurrent use (multiple lab techs storing samples), this will cause confusing errors and potential double-assignments.
4. **I-01 + I-02: N+1 queries** -- Freezer list (2N queries) and box detail (N queries for sample codes) will be noticeably slow as data grows. 50 freezers = 100 extra queries per page load.
5. **I-04: FreezerDetailPage fetches all boxes** -- Fetches unrelated boxes from other freezers, and misses boxes beyond the 100 limit.
6. **I-08: Deactivating freezer orphans stored samples** -- Samples become unfindable via storage search.
7. **C-01: ILIKE injection + unbounded results** -- Information disclosure and potential DoS via storage search.

### Architecture Assessment

The Phase 2 storage management code is **well-designed at the domain level**. The hierarchy (Freezer -> Rack -> Box -> Position) is clean, the consolidation workflow is thoughtful, and the temperature event tracking with notifications is solid. The QR code service is simple and effective.

The main concerns are:

1. **Performance**: The N+1 query patterns in `list_freezers` and `get_box_detail` will become painful as the system scales. These are the highest-traffic views in storage management.

2. **Concurrency**: The `SKIP LOCKED` pattern is misused. It's designed for queue-like scenarios where you want to grab "any available" row, not for locking a specific row by ID. For position assignment, `FOR UPDATE NOWAIT` with proper error handling is more appropriate.

3. **Frontend grid off-by-one**: The box grid visualization is the core UX of storage management and is currently rendering positions in wrong cells. This needs immediate attention.

4. **Regression**: The `useDebounce` fix from Phase 1 was not carried forward to new code, suggesting a need for a shared utility module to prevent copy-paste of known-broken patterns.

The Phase 1 audit fixes are all correctly implemented, with the caveat that the `useDebounce` fix was not applied consistently to new code written in Phase 2.
