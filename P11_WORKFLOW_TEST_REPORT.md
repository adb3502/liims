# P11 -- LIIMS End-to-End Workflow API Test Report

**Date:** 2026-02-12
**Base URL:** `http://localhost:3080`
**Auth User:** `admin@liims.iisc.ac.in` (role: `super_admin`)
**Tester:** Automated curl tests via Claude Code

---

## Authentication

```
POST /api/v1/auth/login
Body: {"email":"admin@liims.iisc.ac.in","password":"Admin@123"}
```

**Result:** 200 OK -- JWT access token issued, expires in 86400s.
Authenticated user: Dr. Ananya Sharma (`super_admin`).

---

## Test Results

### Participant Workflow

#### Test 1 -- Participant Listing with Pagination

| Field | Value |
|---|---|
| **Endpoint** | `GET /api/v1/participants?page=1&per_page=5` |
| **Expected** | 200 with paginated participant array and meta |
| **Actual Status** | 200 |
| **Result** | **PASS** |

**Details:** Returned 5 participants as requested. Meta confirms `total: 50`, `total_pages: 10`, `page: 1`, `per_page: 5`. Pagination works correctly.

Response excerpt:
```json
{
  "success": true,
  "data": [ /* 5 participant objects */ ],
  "meta": {"page":1, "per_page":5, "total":50, "total_pages":10}
}
```

---

#### Test 2 -- Participant Fuzzy Search

| Field | Value |
|---|---|
| **Endpoint** | `GET /api/v1/participants?search=LIIMS` |
| **Expected** | 200 with filtered results (or empty if no match) |
| **Actual Status** | 200 |
| **Result** | **PASS** |

**Details:** Search for "LIIMS" returned 0 results (no participant codes contain "LIIMS"). Follow-up search with `?search=IISC` returned 18 participants, all with `participant_code` containing "IISC" (e.g., `BH-IISC-0001`, `BH-IISC-9999`). Search functionality is confirmed working.

---

#### Test 3 -- Collection Sites Listing

| Field | Value |
|---|---|
| **Endpoint** | `GET /api/v1/collection-sites` |
| **Expected** | 200 with array of collection sites |
| **Actual Status** | 200 |
| **Result** | **PASS** |

**Details:** Returned 3 active collection sites:

| Site Code | Name | City | Participant Range |
|---|---|---|---|
| `IISC` | IISc Main Campus | Bangalore | 1 -- 2000 |
| `JIG` | Jigani Rural Centre | Bangalore | 2001 -- 4000 |
| `JNR` | Jayanagar Urban Clinic | Bangalore | 4001 -- 6000 |

---

#### Test 4 -- Create New Participant

| Field | Value |
|---|---|
| **Endpoint** | `POST /api/v1/participants` |
| **Expected** | 201 Created with new participant object |
| **Actual Status** | 201 |
| **Result** | **PASS** |

**Request body:**
```json
{
  "participant_code": "BH-IISC-9999",
  "group_code": "M2",
  "participant_number": 9999,
  "age_group": 3,
  "sex": "M",
  "collection_site_id": "299dedd9-6d8a-45d7-bb20-4513dd957ad1",
  "enrollment_date": "2026-02-12T00:00:00Z",
  "enrollment_source": "manual",
  "wave": 1
}
```

**Response:** New participant created with `id: 8b6f271d-84dc-4c36-881f-c2828664c681`, `completion_pct: 0`.

---

### Sample Workflow

#### Test 5 -- Sample Listing with Pagination

| Field | Value |
|---|---|
| **Endpoint** | `GET /api/v1/samples?page=1&per_page=5` |
| **Expected** | 200 with paginated sample array and meta |
| **Actual Status** | 200 |
| **Result** | **PASS** |

**Details:** Returned 5 samples. Meta: `total: 225`, `total_pages: 45`, `page: 1`, `per_page: 5`. Sample types observed: `extra_blood`, `rbc_smear`, `stool_kit`, `urine`. Statuses: `received`, `in_analysis`, `collected`.

---

#### Test 6 -- Sample Status Filtering

| Field | Value |
|---|---|
| **Endpoint** | `GET /api/v1/samples?status=stored` |
| **Expected** | 200 with only "stored" samples |
| **Actual Status** | 200 |
| **Result** | **FAIL** |

**Details:** The `status` query parameter is **ignored**. The response returns all 225 samples (`meta.total: 225`) instead of only those with `status: "stored"`. The returned data includes samples with statuses `received`, `in_analysis`, `collected`, `processing`, and `stored` -- mixed together. The API accepts the parameter without error but does not apply the filter.

**Bug:** Status filter on `GET /api/v1/samples` is not implemented or is silently ignored.

---

#### Test 7 -- Get Sample by ID

| Field | Value |
|---|---|
| **Endpoint** | `GET /api/v1/samples/daf45379-88e8-494f-aa9f-c9e58dadc1a7` |
| **Expected** | 200 with full sample detail including history |
| **Actual Status** | 200 |
| **Result** | **PASS** |

**Details:** Returned full sample detail for `BH-IISC-0001-URI-0001` (urine sample). Response includes:
- Core fields: `sample_type: "urine"`, `status: "in_analysis"`, `initial_volume_ul: 4860.00`, `remaining_volume_ul: 3939.54`
- `status_history` array with 1 entry (initial collection)
- `aliquots` array (empty)
- `processing_elapsed_seconds: null`

---

### Storage Workflow

#### Test 8 -- Freezer Listing

| Field | Value |
|---|---|
| **Endpoint** | `GET /api/v1/storage/freezers` |
| **Expected** | 200 with array of freezer units |
| **Actual Status** | 200 |
| **Result** | **PASS** |

**Details:** Returned 5 freezer units:

| Name | Type | Location | Total Positions | Used | Utilization |
|---|---|---|---|---|---|
| ULT-01 (-150C) | minus_150 | Proteomics Lab, Room B204 | 972 | 40 | 4.1% |
| ULT-02 (-80C) | minus_80 | Proteomics Lab, Room B204 | 972 | 0 | 0.0% |
| ULT-03 (-80C) | minus_80 | Metabolomics Lab, Room B206 | 648 | 0 | 0.0% |
| Fridge-01 (+4C) | plus_4 | Sample Processing Area, Room B201 | 648 | 0 | 0.0% |
| RT-Cabinet-01 | room_temp | Dry Storage, Room B210 | 486 | 0 | 0.0% |

---

#### Test 9 -- Box Listing

| Field | Value |
|---|---|
| **Endpoint** | `GET /api/v1/storage/boxes` |
| **Expected** | 200 with array of storage boxes |
| **Actual Status** | 200 |
| **Result** | **PASS** |

**Details:** Returned 20 boxes (page 1 of 3, total 46). All boxes are `cryo_81` type (9x9 = 81 slots), `cardboard_cryo` material. Several boxes show occupied slots (e.g., `ULT-0-R3-B1` has 10 occupied of 81 total).

---

#### Test 10 -- Storage Search

| Field | Value |
|---|---|
| **Endpoint** | `GET /api/v1/storage/search?query=cryo` |
| **Expected** | 200 with matching storage locations |
| **Actual Status** | 422 |
| **Result** | **FAIL** |

**Details:** The endpoint requires a `sample_code` query parameter (not `query`). Using `?query=cryo` returns:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed.",
    "details": [{"field": "query -> sample_code", "message": "Field required", "type": "missing"}]
  }
}
```

**Follow-up:** Retried with `?sample_code=BH` and received 200 OK with empty data (no matching storage locations found). The endpoint works but is specifically for locating a sample by its code in storage, not for general storage search by keyword.

**Verdict:** The endpoint serves a different purpose than expected. It is a "locate sample in storage" search, not a general storage/freezer keyword search. Calling it with `?sample_code=BH` returns 200 with `count: 0` (no samples stored with that prefix match).

---

### Field Operations

#### Test 11 -- Field Events Listing

| Field | Value |
|---|---|
| **Endpoint** | `GET /api/v1/field-events` |
| **Expected** | 200 with array of field events |
| **Actual Status** | 200 |
| **Result** | **PASS** |

**Details:** Returned 3 field events:

| Event Name | Date | Type | Status | Expected | Actual |
|---|---|---|---|---|---|
| IISc Campus Drive - Wave 2 | 2026-02-26 | urban_scheduled | planned | 80 | -- |
| Jayanagar Urban Collection - Wave 1 | 2026-01-24 | urban_scheduled | in_progress | 40 | 22 |
| Jigani Rural Camp - Wave 1 | 2026-01-11 | rural_mass | completed | 60 | 55 |

---

#### Test 12 -- Create New Field Event

| Field | Value |
|---|---|
| **Endpoint** | `POST /api/v1/field-events` |
| **Expected** | 201 Created with new field event object |
| **Actual Status** | 201 |
| **Result** | **PASS** |

**Request body:**
```json
{
  "event_name": "API Test Event - Wave 3",
  "event_date": "2026-03-15",
  "collection_site_id": "299dedd9-6d8a-45d7-bb20-4513dd957ad1",
  "event_type": "urban_scheduled",
  "expected_participants": 25,
  "status": "planned",
  "coordinator_id": "612b93ad-7f5c-418b-8347-6fcb7f1026ba",
  "partner_lab": "healthians",
  "wave": 3
}
```

**Response:** Event created with `id: 35951abd-10f5-4612-807a-6e71d823ded9`, `actual_participants: 0`, `created_by` set to the authenticated admin user.

---

### Dashboard

#### Test 13 -- Dashboard Summary

| Field | Value |
|---|---|
| **Endpoint** | `GET /api/v1/dashboard/summary` |
| **Expected** | 200 with enrollment/sample/storage stats |
| **Actual Status** | 200 |
| **Result** | **PASS** |

**Details:** Summary stats returned:

| Metric | Value |
|---|---|
| Total Enrollment | 50 |
| Recent 30d Enrollment | 4 |
| Total Samples | 225 |
| Samples in Storage | 46 |
| Storage Utilization | 1.1% |
| Upcoming Field Events | 0 |
| Field Ops Completion Rate | 69.4% |
| Active Instrument Runs | 2 |
| QC Pass Rate | 50.0% |

---

#### Test 14 -- Dashboard Enrollment Trend

| Field | Value |
|---|---|
| **Endpoint** | `GET /api/v1/dashboard/enrollment` |
| **Expected** | 200 with enrollment trend data |
| **Actual Status** | 500 |
| **Result** | **FAIL** |

**Details:** Server returns a database error (SQLAlchemy/PostgreSQL `GroupingError`):

```
column "participant.enrollment_date" must appear in the GROUP BY clause
or be used in an aggregate function
```

The SQL uses `date_trunc('day', participant.enrollment_date)` in both SELECT and ORDER BY, but the GROUP BY clause is not correctly matching the expression. This is a backend query bug.

**Bug:** The enrollment trend query has a SQL GROUP BY clause mismatch. The `date_trunc` call in SELECT/ORDER BY does not match what is in GROUP BY.

---

#### Test 15 -- Dashboard Inventory

| Field | Value |
|---|---|
| **Endpoint** | `GET /api/v1/dashboard/inventory` |
| **Expected** | 200 with inventory breakdown |
| **Actual Status** | 200 |
| **Result** | **PASS** |

**Details:** Comprehensive inventory data returned:

**By Sample Type:**

| Type | Count |
|---|---|
| cheek_swab | 33 |
| hair | 30 |
| epigenetics | 29 |
| extra_blood | 28 |
| urine | 27 |
| plasma | 27 |
| rbc_smear | 26 |
| stool_kit | 25 |

**By Status:**

| Status | Count |
|---|---|
| received | 52 |
| collected | 47 |
| stored | 46 |
| processing | 42 |
| in_analysis | 38 |

**Storage:** 3726 total positions, 40 occupied (1.1% utilization). Only `ULT-01 (-150C)` has samples stored (40 positions, 4.1% utilization).

---

## Summary Table

| # | Endpoint | Method | Expected Status | Actual Status | Result |
|---|---|---|---|---|---|
| 1 | `/api/v1/participants?page=1&per_page=5` | GET | 200 | 200 | **PASS** |
| 2 | `/api/v1/participants?search=LIIMS` | GET | 200 | 200 | **PASS** |
| 3 | `/api/v1/collection-sites` | GET | 200 | 200 | **PASS** |
| 4 | `/api/v1/participants` | POST | 201 | 201 | **PASS** |
| 5 | `/api/v1/samples?page=1&per_page=5` | GET | 200 | 200 | **PASS** |
| 6 | `/api/v1/samples?status=stored` | GET | 200 (filtered) | 200 (unfiltered) | **FAIL** |
| 7 | `/api/v1/samples/{id}` | GET | 200 | 200 | **PASS** |
| 8 | `/api/v1/storage/freezers` | GET | 200 | 200 | **PASS** |
| 9 | `/api/v1/storage/boxes` | GET | 200 | 200 | **PASS** |
| 10 | `/api/v1/storage/search?query=cryo` | GET | 200 | 422 | **FAIL** |
| 11 | `/api/v1/field-events` | GET | 200 | 200 | **PASS** |
| 12 | `/api/v1/field-events` | POST | 201 | 201 | **PASS** |
| 13 | `/api/v1/dashboard/summary` | GET | 200 | 200 | **PASS** |
| 14 | `/api/v1/dashboard/enrollment` | GET | 200 | 500 | **FAIL** |
| 15 | `/api/v1/dashboard/inventory` | GET | 200 | 200 | **PASS** |

---

## Overall Score

**12 / 15 PASSED** (80%)

---

## Bugs Found

### BUG-1: Sample status filter not applied (Test 6)
- **Severity:** Medium
- **Endpoint:** `GET /api/v1/samples?status=stored`
- **Issue:** The `status` query parameter is accepted but silently ignored. All 225 samples are returned regardless of the `status` value provided.
- **Expected:** Only samples with `status = "stored"` (46 per dashboard inventory) should be returned.
- **Impact:** Users cannot filter the sample list by processing status via the API.

### BUG-2: Storage search requires `sample_code`, not general `query` (Test 10)
- **Severity:** Low
- **Endpoint:** `GET /api/v1/storage/search`
- **Issue:** The endpoint expects `sample_code` as a required parameter, not a general `query` parameter. This makes it a "locate sample" tool, not a general storage search.
- **Expected:** Either support a general `query` parameter for searching storage entities (freezers, racks, boxes) by name/label, or document that this endpoint is specifically for locating a sample's storage position.
- **Impact:** No way to search storage hierarchy by keyword (e.g., "cryo", "proteomics").

### BUG-3: Dashboard enrollment trend query crashes (Test 14)
- **Severity:** High
- **Endpoint:** `GET /api/v1/dashboard/enrollment`
- **Issue:** SQL `GROUP BY` clause does not include the `date_trunc` expression used in SELECT and ORDER BY. PostgreSQL requires all non-aggregate SELECT expressions to appear in GROUP BY.
- **Error:** `column "participant.enrollment_date" must appear in the GROUP BY clause or be used in an aggregate function`
- **Impact:** The enrollment trend chart on the dashboard is completely broken -- returns 500 for all requests.

---

## Recommendations

1. **Fix BUG-3 immediately** -- the enrollment dashboard endpoint is a 500 error, meaning the dashboard enrollment trend chart is non-functional. The fix is straightforward: ensure `date_trunc('day', enrollment_date)` appears in the GROUP BY clause.
2. **Implement sample status filtering** (BUG-1) -- add query parameter handling in the samples list endpoint to filter by `status`.
3. **Clarify or expand storage search** (BUG-2) -- either rename the endpoint to `/api/v1/storage/locate-sample` for clarity, or add general search capability across freezers/racks/boxes by name.
