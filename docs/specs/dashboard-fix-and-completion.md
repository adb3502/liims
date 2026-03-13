# Spec: Dashboard Fix & Feature Completion

**Date**: 2026-02-24
**Status**: Complete (merged to master 2026-03-13)
**Branch**: feature/ui-overhaul → master
**Phase**: Bug fix + feature completion (Full-stack)

---

## Completion Summary (as of 2026-03-13)

| Category | Total | Done | In Progress | Not Started |
|----------|-------|------|-------------|-------------|
| Bug Fixes | 7 | 7 | 0 | 0 |
| Missing Features | 6 | 5 | 1 | 0 |
| Deep Features | 7 | 3 | 0 | 4 |
| Lower Priority | 4 | 0 | 0 | 4 |

---

---

## 1. Bug Fixes (Critical) — ALL FIXED ✅

### BUG-1: Age group filter crashes Data Explorer ✅
- Root cause: Backend enum comparison failure on `age_group=1`
- Fix: Added `_parse_cohort_filters()` helper that correctly converts query params to enum values. Shared across distribution, scatter, correlation, and metadata-table endpoints.

### BUG-2: Box plots overlapping in Data Explorer ✅
- Root cause: Missing explicit `x` arrays on Plotly traces
- Fix: Each group trace sets `x: values.map(() => label)` so every point lands on its category. Removed `boxmode: 'group'`. Spacing controlled via `boxgap`/`violingap`.

### BUG-3: Enrollment trend is single point ✅
- Root cause: Bulk import set all `enrollment_date` to import timestamp
- Fix: Backfilled `participant.enrollment_date` from blood chemistry `Sample_Date` columns (CSV) and ODK submission dates. `EnrollmentDateSource` enum tracks source of each date.

### BUG-4: Field Operations quick action link broken ✅
- Fix: Changed `/reports/field-ops` → `/field-ops/events` throughout sidebar and dashboard quick actions.

### BUG-5: Quality dashboard errors ✅
- Fix: Debugged API response handling, added proper loading/error/empty states.

### BUG-6: Query builder doesn't work ✅
- Fix: Debugged and fixed dynamic query execution pipeline.

### BUG-7: Font not rendering ✅
- Original fix: Added Google Fonts CDN import.
- Superseded: Red Hat Display and JetBrains Mono are now self-hosted as woff2 files. No CDN dependency — works offline.

## 2. Missing Features (from Shiny app comparison)

### FEAT-1: Violin plots + toggle points ✅
- Added violin, half-violin, histogram, density (KDE) chart types to Data Explorer distribution tab
- "Show points" toggle with density-scaled jitter (points follow violin shape — wider at peak, narrower at tails)
- "Points side" toggle (left/right/both overlay)

### FEAT-2: Color-by options ✅
- Color By dropdown: Sex, Age Group, Site, Site Type (Urban/Rural), Age+Sex combined
- Per-point `marker.color` arrays for scatter overlays
- Palette selector: Default, Viridis, Plasma, Colorblind-safe
- Consistent: same category = same color across every chart

### FEAT-3: Sample size N displayed on all charts ✅
- N shown per group in legend and hover
- Total N shown in chart subtitle / stats panel

### FEAT-4: Three-level map drill-down — PARTIAL ⚠️
- ✅ India-level map with pin code geocoded participant bubbles (CartoDB Positron tiles)
- ✅ Sites tab with hospital markers
- ✅ Per-site enrollment dashboard at `/reports/enrollment/sites/:siteCode`
- ❌ Bengaluru city-level map (zoom in to hospital neighbourhood) — not yet built

### FEAT-5: Category-wise enrollment stats ✅
- Enrollment matrix: rows = sites, columns = 10 group codes (1A–5B)
- Per-cell: current count, target, and remaining slots
- Colour coding: green (on target), amber (behind), red (far behind)
- Site names link to per-site enrollment dashboard

### FEAT-6: Slots remaining visualization ✅
- Progress bars and colour coding in enrollment matrix (see FEAT-5)
- Per-site dashboard shows individual group completion

## 3. Deeper Features (not explicitly requested but study-critical)

### DEEP-1: Enrollment date fix using real sample dates ✅
- Backfilled `participant.enrollment_date` from blood chemistry CSV `Sample_Date/Month/Year` columns
- ODK submissions also used as fallback date source
- `EnrollmentDateSource` enum tags each date with its provenance
- Enrollment trend chart now shows real monthly collection activity

### DEEP-2: 10 group codes (1A-5B) enrollment matrix per site ✅
- Full matrix in EnrollmentDashboardPage: rows = active sites, columns = 1A–5B
- Each cell shows current/target/remaining, colour coded
- Targets confirmed by Super PM: BBH/RMH/SSSSMH/CHAF = 100 per group code (1000 total); BMC/JSS not active

### DEEP-3: Regression/scatter tab in Data Explorer ✅
- `GET /data-explorer/scatter` endpoint: Pearson/Spearman correlation, R², p-value, linear regression coefficients
- ScatterTab: X/Y parameter selectors, regression line toggle, stats panel
- Color By: Age Group, Sex, Site, Age+Sex
- Cohort filters (age_group, sex, site) passed through to backend

### DEEP-4: Sample collection completeness per participant — NOT STARTED ❌
- Dashboard showing % of participants with all expected sample types collected
- Flag incomplete participants

### DEEP-5: ODK clinical data completeness — NOT STARTED ❌
- Completeness % per field: vitals, DASS-21, MMSE, WHO-QOL, frailty
- Available via the new `/data-explorer/metadata-table` — but no dedicated completeness dashboard yet

### DEEP-6: Comorbidity prevalence by age group — NOT STARTED ❌
- DM, HTN, IHD rates across age groups as grouped bar chart

### DEEP-7: Urban vs Rural breakdown — PARTIAL ✅
- Site type (Urban/Rural) available as a Color By and Group By dimension in Data Explorer
- Computed client-side: `{ RMH: 'Urban', BBH: 'Urban', CHAF: 'Urban', SSSSMH: 'Rural' }`

## 4. Additional Completed (Post-Spec)

### POST-1: BHARAT role taxonomy rename ✅ (2026-03-13)
- Replaced generic roles (LAB_MANAGER, FIELD_COORDINATOR etc.) with study-specific roles (LII_PI_RESEARCHER, SCIENTIST, ICMR_CAR_JRF, ICMR_CAR_POSTDOC, FIELD_OPERATIVE, CLINICAL_TEAM, CLINICAL_PARTNER)
- Alembic migration 005 updates existing DB rows
- All 21 API modules, frontend RoleGuard, auth hooks, and UserRole enum updated

### POST-2: Metadata Explorer ✅ (2026-03-13)
- New `MetadataExplorerPage` at `/reports/metadata-explorer`
- Backend: `GET /data-explorer/metadata-table` — paginated flat table of participant demographics, lifestyle, vitals, scores
- Backend: `GET /data-explorer/strata` — list of categorical fields for stratification
- Distribution endpoint now accepts `strata=<field>` for per-stratum box plot groups

### POST-3: Self-hosted fonts ✅
- Red Hat Display and JetBrains Mono woff2 files served locally
- Removed Google Fonts CDN dependency (enables full offline PWA operation)

### POST-4: CORS_ALLOW_ALL ✅
- New config flag for local-network deployments where the server IP is dynamic
- Never enabled in production

## 5. Lower Priority — Not Started

### LP-1: Blood report PDF extraction (WS4) ❌
### LP-2: Mobile responsiveness (WS7) ❌
### LP-3: Bundle code-splitting (Plotly behind dynamic import) ❌
### LP-4: PCA analysis tab (needs numpy on backend) ❌
### LP-5: Bengaluru city-level map (FEAT-4 level 3) ❌
### LP-6: Sample collection completeness dashboard (DEEP-4) ❌
### LP-7: ODK clinical data completeness dashboard (DEEP-5) ❌
### LP-8: Comorbidity prevalence chart (DEEP-6) ❌

## 4. Review Scoping

Per CLAUDE.md Section 6 (Full-stack feature):
- **Marcus**: Architecture review (API contracts, data flow)
- **James**: Scientific validity (stat displays, distribution charts, scales)
- **Robert**: Browser E2E verification (all pages, all states)
- **Alexandra**: A11y, colorblind palettes, responsive
- **Dmitri**: Security (data endpoints, participant data exposure)
- **Henrik**: Full holistic gate

## 5. Test Strategy

- Robert runs Playwright against every dashboard page
- Verify: charts render with real data, filters work, no console errors
- Verify: all navigation links work
- Verify: responsive at 1440px, 1024px, 768px
