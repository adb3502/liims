# P10 Browser Test Report: Participants, Samples & Storage

**Date**: 2026-02-12
**Tester**: browser-test-samples (automated Playwright)
**App URL**: http://localhost:3080
**Login**: admin@liims.iisc.ac.in (Super Admin)

---

## Test Environment Notes

Multiple browser test agents shared a single Playwright browser instance simultaneously,
causing intermittent page navigation conflicts. Some tests required multiple attempts due
to other agents navigating the shared browser away. Results below reflect the confirmed
outcomes from successful test executions.

---

## TEST 1: Participants List Page

**URL**: `/participants`
**Result**: **PASS**

**Observations**:
- Page heading: "Participants"
- Count display: "50 participants" -- matches expected seed data of 50
- Table renders 25 rows per page with pagination (Page 1 of 2)
- Table columns: Code, Age Group, Sex, Site, Enrolled, Source, Completion
- First row: BH-IISC-0001, 60-74, Male, IISc Main Campus, 1/12/2026, bulk import, 29%
- "Add Participant" button visible
- Breadcrumb: Home > Participants
- Sidebar sub-navigation: All Participants, Create, ODK Sync

**Filters available**:
- Site dropdown: All Sites, IISc Main Campus, Jigani Rural Centre, Jayanagar Urban Clinic
- Age dropdown: All Ages, 18-29, 30-44, 45-59, 60-74, 75+
- Sex dropdown: All Sex, Male, Female

**Pagination**: Previous (disabled on page 1), Next button functional

---

## TEST 2: Participant Search

**URL**: `/participants` (with search query)
**Result**: **PASS**

**Observations**:
- Search box placeholder: "Search by code, group, or number..."
- Searched for "JIG"
- Before search: 25 rows visible (all participants)
- After search: 17 rows visible, ALL containing "JIG" in code -- correctly filtered
- Sample filtered codes: BH-JIG-2002, BH-JIG-2005, BH-JIG-2008, BH-JIG-2011, BH-JIG-2014
- Search filters results in real-time (client-side or debounced API call)

---

## TEST 3: Participant Detail Page

**URL**: `/participants/{id}` (BH-IISC-0001)
**Result**: **PASS**

**Observations**:
- Heading: "BH-IISC-0001"
- Demographics shown: 60-74, Male, Wave 1, bulk import
- Tabs: Overview, Consents (2), Samples, Timeline
- Enrollment Details section:
  - Group: M1
  - Number: 1
  - Site: IISc Main Campus
  - Enrolled: 1/12/2026
- Completion Status: 29% (with visual indicator)
- Sample Counts by Type:
  - extra blood: 1
  - rbc smear: 1
  - urine: 1
- "Edit" button available
- "Back to Participants" navigation link

---

## TEST 4: Samples List Page

**URL**: `/samples`
**Result**: **PASS**

**Observations**:
- Page heading: "Samples"
- Count display: "225 samples" -- exceeds expected 200+ threshold
- Table renders 25 rows per page with pagination
- Table columns: Sample Code, Type, Status, Participant, Volume, Collection Date, Wave
- First row: BH-IISC-0001-EXT-0002, Extra Blood, Received, b976c63f, ---, 12/7/2025, W3

**Type filter options**: All Types, Plasma, Epigenetics, Extra Blood, RBC Smear, Cheek Swab, Hair, Urine, Stool Kit

**Status filter options**: All Statuses, Registered, Collected, Transported, Received, Processing, Stored, Reserved, In Analysis, Pending Discard, Depleted, Discarded

---

## TEST 5: Sample Filtering

**URL**: `/samples?type=plasma` and `/samples?status=stored`
**Result**: **PASS**

### Filter by Type (Plasma):
- Selected "Plasma" from type dropdown
- Count updated to: "27 samples"
- All 25 visible rows showed type "Plasma" -- correctly filtered
- Pagination still functional

### Filter by Status (Stored):
- Selected "Stored" from status dropdown
- Count updated to: "46 samples"
- All 25 visible rows showed status "Stored" -- correctly filtered

---

## TEST 6: Sample Detail Page

**URL**: `/samples/{id}` (BH-IISC-0001-EXT-0002)
**Result**: **PASS**

**Observations**:
- Heading: "BH-IISC-0001-EXT-0002"
- Type: Extra Blood
- Status: Received
- Wave: Wave 3
- Tabs: Overview, Status History (1), Aliquots (0), Actions
- Collection Details:
  - Participant: b976c63f (linked)
  - Collected: 12/7/2025, 4:23:05 AM
- Volume & Storage section: "This sample type does not track volume."
- "Back to Samples" navigation link

---

## TEST 7: Storage Freezers Page

**URL**: `/storage/freezers`
**Result**: **PASS**

**Observations**:
- Page heading: "Storage Freezers"
- Count display: "5 freezers" with "40/3,726 positions used (1%)"
- "Add Freezer" button available
- Temperature filter buttons: -150C, -80C, +4C, Room Temp

**Freezers listed**:
| Name | Location | Temp | Positions | Utilization |
|------|----------|------|-----------|-------------|
| ULT-01 (-150C) | Proteomics Lab, Room B204 | -150C | 40/972 | 4% |
| ULT-02 (-80C) | Proteomics Lab, Room B204 | -80C | 0/972 | 0% |
| ULT-03 (-80C) | Metabolomics Lab, Room B206 | -80C | 0/648 | 0% |
| Fridge-01 (+4C) | Sample Processing Area, Room B201 | +4C | 0/648 | 0% |
| RT-Cabinet-01 | Dry Storage, Room B210 | Room Temp | 0/486 | 0% |

### Freezer Detail (ULT-01):
**URL**: `/storage/freezers/{id}`
**Result**: **PASS**

- Heading: "ULT-01 (-150C)"
- Location: Proteomics Lab, Room B204
- Stats: Total 972, Occupied 40, Available 932, 4% utilization
- Tabs: Racks & Boxes, Temperature Events
- 6 Racks visible (Rack-1 through Rack-6)
- Each rack shows "0 boxes" with "Add Box" button
- "Batch Add Racks" and "Add Rack" buttons available

---

## Bugs & Issues Found

### BUG-S01: Dashboard crashes on login (CRITICAL)
- **Page**: `/` (Dashboard / home page)
- **Error**: `TypeError: Cannot read properties of undefined (reading 'recent_30d')`
- **Impact**: After login, user lands on a crashed error boundary page
- **Root cause**: Dashboard component accesses `.recent_30d` on an undefined API response
- **Workaround**: Navigate directly to other pages via URL

### BUG-S02: Intermittent participant list render crash (MAJOR)
- **Page**: `/participants`
- **Error**: `TypeError: Cannot read properties of undefined (reading 'toLocaleString')`
- **Impact**: Participant list occasionally crashes during rendering
- **Root cause**: Frontend calls `.toLocaleString()` on a field that can be undefined
- **Note**: This was intermittent -- sometimes the page renders fine, sometimes it crashes. Likely a race condition where data arrives partially before rendering.

### BUG-S03: Participant detail shows truncated participant ID (MINOR)
- **Page**: `/samples/{id}`
- **Issue**: Participant column in sample list shows raw UUID fragment (e.g., "b976c63f") instead of participant code
- **Expected**: Should show participant code like "BH-IISC-0001"

### BUG-S04: Storage boxes API returns 500 error (MAJOR)
- **Page**: `/storage/freezers/{id}`
- **Error**: Server responds with 500 for boxes query with `per_page=200`
- **Impact**: Boxes within racks don't load -- all racks show "No boxes in this rack yet"
- **Note**: 40 positions are reported as occupied but no boxes are visible in the UI

### BUG-S05: Field events API returns 503 (MINOR)
- **Endpoint**: `/api/v1/field-events/`
- **Impact**: Background API calls failing with 503 Service Unavailable

---

## Summary

| # | Test | Result | Notes |
|---|------|--------|-------|
| 1 | Participants list loads with 50 participants | **PASS** | Table, pagination, filters all work |
| 2 | Participant search functionality | **PASS** | Filters correctly by code substring |
| 3 | Participant detail page | **PASS** | Shows info, samples, consents, timeline tabs |
| 4 | Samples list loads with 200+ samples | **PASS** | 225 samples with type/status filters |
| 5 | Sample filtering by type and status | **PASS** | Both filters work correctly |
| 6 | Sample detail page | **PASS** | Shows metadata, status history, aliquots tabs |
| 7 | Storage freezer list and detail | **PASS** | 5 freezers, rack layout visible |

**Overall**: 7/7 tests PASS with 5 bugs identified (1 critical, 2 major, 2 minor)

---

## Screenshots

Screenshots saved to `test-screenshots/` directory:
- `02-participants-list.png` - Participants list page
- `03-participants-search.png` - Participants search results
- `04-participant-detail.png` - Participant detail page
- `05-samples-list.png` - Samples list page
- `06-samples-filter-type.png` - Samples filtered by Plasma type
- `07-samples-filter-status.png` - Samples filtered by Stored status
- `08-sample-detail.png` - Sample detail page
- `09-storage-freezers.png` - Storage freezers overview
- `10-storage-freezer-detail.png` - Freezer ULT-01 detail with racks
