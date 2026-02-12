# P10 Browser Test Report: Field Ops, Partners & Instruments

**Date:** 2026-02-12
**Tester:** browser-test-fieldops (automated Playwright)
**App URL:** http://localhost:3080
**Login:** admin@liims.iisc.ac.in (Super Admin)

---

## Test Summary

| # | Test Case | Result | Details |
|---|-----------|--------|---------|
| 1 | Field Events list page | **PASS** | 3 seeded events loaded with filters |
| 2 | Field Event detail page | **PARTIAL** | Page exists in router but row click navigation unreliable due to SPA timing |
| 3 | Instruments list page | **PASS** | 5 instruments in card view with type badges |
| 4 | Instrument Runs page | **PASS** | 10 runs with status/QC badges, filters |
| 5 | Run Detail page (click-through) | **FAIL** | Row click handler navigates to wrong page (SPA routing issue) |
| 6 | Partners Import page | **PASS** | 4-step wizard with partner lab selection |
| 7 | Partners Import History | **PASS** | 2 import records from Healthians and Lal Path Labs |
| 8 | Stool Kit Tracker | **PASS** | 8 kits with status pipeline tracking |
| 9 | Plate Designer | **PASS** | 7 plates (96-well) linked to runs |
| 10 | Omics Results page | **PASS** | 1 proteomics result set, 1200 features, 18 samples |
| 11 | ICC Workflow page | **PASS (UI)** | Page loads with pipeline stages but API returns error |
| 12 | Field Ops Conflicts page | **PASS** | Placeholder page renders correctly |

**Overall: 10 PASS, 1 PARTIAL, 1 FAIL**

---

## Detailed Results

### TEST 1: Field Events List Page
- **URL:** `/field-ops/events`
- **Result:** PASS
- **Screenshot:** `test-fieldops-02-field-events-list.png`
- **Details:**
  - Heading: "Field Events" with count "3 events"
  - Filter controls: Status (All/Planned/In Progress/Completed/Cancelled), Site (All Sites/IISc Main Campus/Jigani Rural Centre/Jayanagar Urban Clinic), Date range (From/To)
  - "Create Event" button present
  - Table columns: Event Name, Date, Site, Type, Status, Expected, Actual, Partner Lab
  - **Seeded events:**
    1. "IISc Campus Drive - Wave 2" | 2/26/2026 | Jayanagar Urban Clinic | Urban Scheduled | Planned | 80 expected | --- actual | Healthians
    2. "Jayanagar Urban Collection - Wave 1" | 1/24/2026 | Jigani Rural Centre | Urban Scheduled | In Progress | 40 expected | 22 actual | Healthians
    3. "Jigani Rural Camp - Wave 1" | 1/11/2026 | IISc Main Campus | Rural Mass | Completed | 60 expected | 55 actual | Healthians
  - Sidebar shows sub-navigation: Events, Conflicts
  - Breadcrumb: Home > Field Operations > Events

### TEST 2: Field Event Detail Page
- **URL:** `/field-ops/events/:id`
- **Result:** PARTIAL
- **Details:**
  - Route exists in router.tsx (line 197: `{ path: 'events/:id', element: <FieldEventDetailPage /> }`)
  - Could not reliably navigate to detail page via row click due to SPA timing/navigation issues
  - The table rows have `cursor-pointer` CSS class indicating they are clickable
  - React onClick handlers are attached but the SPA router redirects before the click completes

### TEST 3: Instruments List Page
- **URL:** `/instruments`
- **Result:** PASS
- **Screenshot:** `test-fieldops-04-instruments-list.png`
- **Details:**
  - Heading: "Instruments" with "5 instruments registered"
  - "Register Instrument" button present
  - Filter controls: Search by name/manufacturer/model, Type dropdown (All Types/Liquid Handler/Mass Spectrometer/Other), Status (All Status/Active/Inactive)
  - Card view layout with color-coded type badges:
    1. **Agilent Bravo** | Proteomics Lab B204 | Liquid Handler (cyan border) | Manufacturer: Agilent | Model: Bravo AssayMAP
    2. **Thermo Q Exactive HF** | Proteomics Lab B204 | Mass Spectrometer (purple border) | Manufacturer: Thermo Fisher | Model: Q Exactive HF-X
    3. **Waters Xevo TQ-XS** | Metabolomics Lab B206 | Mass Spectrometer (purple border) | Manufacturer: Waters | Model: Xevo TQ-XS
    4. **Hamilton STARlet** | Sample Processing B201 | Liquid Handler (cyan border) | Manufacturer: Hamilton | Model: STARlet
    5. **Leica DMi8** | ICC Lab B208 | Other (gray border) | Manufacturer: Leica | Model: DMi8 Microscope
  - Sidebar sub-navigation: Dashboard, Queue, Plate Designer, Runs, Omics Results, ICC Workflow

### TEST 4: Instrument Runs Page
- **URL:** `/instruments/runs`
- **Result:** PASS
- **Screenshot:** `test-fieldops-05-instrument-runs.png`
- **Details:**
  - Heading: "Instrument Runs" with "10 runs"
  - "New Run" button present
  - Filter controls: All Instruments, All Types, All Statuses, Search
  - Table columns: Run Name, Instrument, Type, Status, QC, Started, Completed, Samples
  - **Seeded runs (10 total):**
    1. MET-RUN-002 | Waters Xevo TQ-XS | Metabolomics | In Progress | Pending | 18 Dec 2025 | --- | 19 samples
    2. PREP-RUN-003 | Agilent Bravo | Plate Prep | Planned | Pending | --- | --- | 0 samples
    3. PROT-RUN-002 | Thermo Q Exactive HF | Proteomics | Completed | Passed | 16 Dec 2025 | 17 Dec 2025 | 13 samples
    4. PROT-RUN-001 | Thermo Q Exactive HF | Proteomics | Completed | Passed | 12 Jan 2026 | 13 Jan 2026 | 18 samples
    5. PREP-RUN-001 | Agilent Bravo | Plate Prep | Completed | Passed | 14 Dec 2025 | 14 Dec 2025 | 14 samples
    6. PROT-RUN-003 | Thermo Q Exactive HF | Proteomics | In Progress | Pending | 09 Feb 2026 | --- | 11 samples
    7. MET-RUN-003 | Waters Xevo TQ-XS | Metabolomics | Planned | Pending | --- | --- | 0 samples
    8. MET-RUN-001 | Waters Xevo TQ-XS | Metabolomics | Completed | Passed | 26 Dec 2025 | 27 Dec 2025 | 12 samples
    9. PROT-RUN-004 | Thermo Q Exactive HF | Proteomics | Failed | Failed | 16 Dec 2025 | --- | 0 samples
    10. PREP-RUN-002 | Hamilton STARlet | Plate Prep | Completed | Passed | 20 Dec 2025 | 20 Dec 2025 | 13 samples
  - Status badges are color-coded (In Progress = orange, Completed = green, Planned = gray, Failed = red)

### TEST 5: Run Detail Page (Click-Through)
- **URL:** `/instruments/runs/:id`
- **Result:** FAIL
- **Details:**
  - Route exists in router.tsx (line 224: `{ path: 'runs/:id', element: <RunDetailPage /> }`)
  - Table rows have `cursor-pointer` class but clicking navigated to a freezer detail page instead
  - This appears to be a React onClick handler timing issue - the SPA router intercepts before the click handler fires
  - **BUG:** Row click navigation on Instrument Runs table does not work reliably

### TEST 6: Partners Import Page
- **URL:** `/partners/import`
- **Result:** PASS
- **Screenshot:** `test-fieldops-07-partners-import.png`
- **Details:**
  - Heading: "Import Partner Data"
  - 4-step wizard: Upload > Preview > Mapping > Import
  - "Back to Import History" link
  - Partner Lab dropdown: Healthians, 1mg, Lal Path Labs, DecodeAge
  - CSV file upload area with drag-and-drop support
  - "Upload & Preview" button (disabled until file selected)
  - Sidebar sub-navigation: Import Data, Import History, ODK Sync, Stool Kits, Results

### TEST 7: Partners Import History
- **URL:** `/partners/history`
- **Result:** PASS
- **Screenshot:** `test-fieldops-10-partners-history.png`
- **Details:**
  - Heading: "Import History" with "2 imports"
  - "New Import" button
  - Partner filter: All Partners, Healthians, 1mg, Lal Path Labs, DecodeAge
  - **Seeded imports:**
    1. Healthians | 12/24/2025 | healthians_results_batch_1.xlsx | 24 total | 22 matched | 1 failed | "Batch 1 import from healthians"
    2. Lal Path Labs | 1/12/2026 | lalpath_results_batch_2.xlsx | 21 total | 18 matched | 0 failed | "Batch 2 import from lalpath"

### TEST 8: Stool Kit Tracker
- **URL:** `/partners/stool-kits`
- **Result:** PASS
- **Screenshot:** `test-fieldops-11-stool-kits.png`
- **Details:**
  - Heading: "Stool Kit Tracker" with "8 kits"
  - "Issue Kit" button
  - Status filter: All Statuses, Issued, Pickup Scheduled, Collected by DecodeAge, Processing, Results Received
  - Table columns: Kit Code, Participant, Issued, Status, Pickup Date, Results, Notes, Action
  - 8 kits in various pipeline stages with "Update" action buttons
  - Kits tracked through full lifecycle: Issued -> Pickup Scheduled -> Collected -> Processing -> Results Received

### TEST 9: Plate Designer
- **URL:** `/instruments/plates`
- **Result:** PASS
- **Screenshot:** `test-fieldops-12-plate-designer.png`
- **Details:**
  - Heading: "Plates" with "7 plates"
  - "Create Plate" button
  - 7 plates displayed as cards:
    1. PROT-RUN-001-P1 (8x12, 96 wells) - Linked
    2. PROT-RUN-002-P1 (8x12, 96 wells) - Linked
    3. PROT-RUN-003-P1 (8x12, 96 wells) - Linked
    4. MET-RUN-001-P1 (8x12, 96 wells) - Linked
    5. MET-RUN-002-P1 (8x12, 96 wells) - Linked
    6. PREP-RUN-001-P1 (8x12, 96 wells) - Linked
    7. PREP-RUN-002-P1 (8x12, 96 wells) - Linked
  - Each plate has "View Details" link

### TEST 10: Omics Results Page
- **URL:** `/instruments/omics`
- **Result:** PASS
- **Screenshot:** `test-fieldops-08-omics-results.png`
- **Details:**
  - Heading: "Omics Results" with subtitle "Browse proteomics and metabolomics result sets"
  - Summary cards: Total Result Sets (1), Features (1,200), Samples (18)
  - Filter: Type dropdown, Run ID text filter
  - Table columns: Result Type, Run Name, Analysis Software, Import Date, Features, Samples, QC Summary
  - **Seeded data:** 1 Proteomics result set | MaxQuant v2.4.3.0 | 09 Feb 2026 | 1,200 features | 18 samples | QC Pending

### TEST 11: ICC Workflow Page
- **URL:** `/instruments/icc`
- **Result:** PASS (UI loads) / ISSUE (API error)
- **Screenshot:** `test-fieldops-09-icc-workflow.png`
- **Details:**
  - Heading: "ICC Workflow" with subtitle "Immunocytochemistry processing pipeline"
  - "New ICC Processing" button present
  - Pipeline stage filter: All Stages, Received, Fixation, Permeabilization, Blocking, Primary Antibody, Secondary Antibody, DAPI Staining, Mounted, Imaging, Analysis Complete
  - Shows "0 total, 0 in progress"
  - **ERROR:** Red error banner: "Failed to load ICC records. Please try again."
  - API endpoint `/api/v1/icc?per_page=200` returns 503 (service worker offline cache issue)

### TEST 12: Field Ops Conflicts Page
- **URL:** `/field-ops/conflicts`
- **Result:** PASS
- **Details:**
  - Renders as placeholder page with title "Sync Conflicts"
  - Under development message displayed

---

## Issues Found

### Critical (C)
1. **C-01: Dashboard crashes on login** - `TypeError: Cannot read properties of undefined (reading 'recent_30d')` - The main dashboard page (`/`) crashes with a React error, which sometimes cascades to other navigation. This is the root cause of many session and navigation issues observed during testing.

### Important (I)
1. **I-01: Run detail click-through broken** - Clicking rows in the Instrument Runs table navigates to wrong pages instead of `/instruments/runs/:id`. The React onClick handler appears to have a conflict with SPA routing.
2. **I-02: ICC API returns 503** - The ICC workflow page shows "Failed to load ICC records" because the `/api/v1/icc` endpoint returns 503 via the service worker offline cache. This may indicate the ICC endpoint is not properly registered or the service worker intercepts it.
3. **I-03: Field events API intermittently returns 503** - The `/api/v1/field-events/` endpoint sometimes returns 503 "OFFLINE" via the service worker, though the page eventually loads data after networkidle wait.

### Minor (M)
1. **M-01: SPA routing instability** - Navigation between pages sometimes redirects to unexpected locations (e.g., navigating to `/instruments` redirects to `/samples`). This appears to be a timing issue with the auth store and route guards.
2. **M-02: Service worker aggressively caches** - The PWA service worker intercepts API calls and returns 503 OFFLINE responses even when online. This causes intermittent data loading failures across multiple pages.

---

## Pages Verified Working

| Page | URL | Status |
|------|-----|--------|
| Field Events List | `/field-ops/events` | Working (3 events) |
| Field Ops Conflicts | `/field-ops/conflicts` | Placeholder |
| Instruments Dashboard | `/instruments` | Working (5 instruments) |
| Instrument Runs | `/instruments/runs` | Working (10 runs) |
| Plate Designer | `/instruments/plates` | Working (7 plates) |
| Omics Results | `/instruments/omics` | Working (1 result set) |
| ICC Workflow | `/instruments/icc` | UI loads, API error |
| Partners Import | `/partners/import` | Working (wizard) |
| Partners History | `/partners/history` | Working (2 imports) |
| Partners Stool Kits | `/partners/stool-kits` | Working (8 kits) |
| Partners ODK Sync | `/partners/odk-sync` | Not tested |
| Partners Results | `/partners/results` | Not tested (placeholder) |

---

## Seed Data Summary

| Entity | Count | Notes |
|--------|-------|-------|
| Field Events | 3 | Planned, In Progress, Completed |
| Instruments | 5 | 2 Liquid Handlers, 2 Mass Specs, 1 Other |
| Instrument Runs | 10 | Multiple statuses and types |
| Plates | 7 | All 96-well, linked to runs |
| Omics Result Sets | 1 | Proteomics, 1200 features |
| Partner Imports | 2 | Healthians, Lal Path Labs |
| Stool Kits | 8 | Various pipeline stages |
| Partner Labs | 4 | Healthians, 1mg, Lal Path Labs, DecodeAge |
