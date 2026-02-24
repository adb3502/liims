# Spec: Dashboard Fix & Feature Completion

**Date**: 2026-02-24
**Status**: Approved (implicit from Super PM feedback)
**Branch**: feature/ui-overhaul
**Phase**: Bug fix + feature completion (Full-stack)

---

## 1. Bug Fixes (Critical)

### BUG-1: Age group filter crashes Data Explorer
- Symptom: "Failed to load distribution data" when age group checkbox selected
- Root cause: Backend receives `age_group=1` but enum comparison fails
- Fix: Debug backend /distribution endpoint, fix enum filtering

### BUG-2: Box plots overlapping in Data Explorer
- Symptom: All 5 age groups rendered at x=0 stacked on top of each other
- Root cause: Plotly traces not using separate x positions per group
- Fix: Each group needs its own trace with name, or use `boxmode: 'group'`

### BUG-3: Enrollment trend is single point
- Symptom: Chart shows 1 dot because all participants share same enrollment_date
- Root cause: Bulk import set all enrollment_date to import timestamp
- Fix: Use blood chemistry sample dates (Sample_Date/Month/Year from CSV) or ODK submission date as proxy for enrollment timeline

### BUG-4: Field Operations quick action link broken
- Symptom: Links to `/reports/field-ops` which doesn't exist
- Fix: Change to `/field-ops/events`

### BUG-5: Quality dashboard errors
- Symptom: Page doesn't render properly
- Fix: Debug and fix API response handling

### BUG-6: Query builder doesn't work
- Symptom: Page non-functional
- Fix: Debug and fix

### BUG-7: Font not rendering
- Symptom: Red Hat Display not loading
- Fix: Add Google Fonts import to index.html

## 2. Missing Features (from Shiny app comparison)

### FEAT-1: Violin plots + toggle points
- Add violin plot option to Data Explorer distribution tab
- Add "show points" toggle (jitter overlay)
- Match Shiny app: Box, Violin, Histogram, Density plot types

### FEAT-2: Color-by options
- Add color-by dropdown: Age Group, Sex, Provider, HbA1c Status, custom
- Apply to scatter plots and distributions
- Color palette selector: Default, Viridis, Plasma, Wes Anderson

### FEAT-3: Sample size N displayed on all charts
- Show N per group on box/violin plots
- Show total N in chart subtitle

### FEAT-4: Three-level map drill-down
- Map 1: India with Karnataka highlighted
- Map 2: Karnataka with Bengaluru/Mysuru sites
- Map 3: Bengaluru city with precise hospital locations
- Get CORRECT coordinates from Google Maps for each hospital

### FEAT-5: Category-wise enrollment stats
- Table/chart showing enrollment by group code (1A, 1B, 2A, 2B, etc.) per centre
- Shows current count and target/slots remaining
- Site ranges: RMH 1-100, SSSSMH 101-200, BBH 201-400, CHAF 401-500

### FEAT-6: Slots remaining visualization
- Per centre, per category: bar chart showing filled vs remaining slots
- Target: 100 per centre per age-sex group (or whatever the actual target is)

## 3. Deeper Features (not explicitly requested but study-critical)

### DEEP-1: Enrollment date fix using real sample dates
- The CSV has Sample_Date, Sample_Month, Sample_Year columns
- ODK submissions have submission_date
- Backend needs to backfill participant.enrollment_date from these real dates
- Enrollment trend chart should show actual monthly collection activity

### DEEP-2: 10 group codes (1A-5B) enrollment matrix per site
- This is THE core recruitment metric for the study
- Matrix: rows = sites (RMH, SSSSMH, BBH, CHAF), columns = group codes (1A through 5B)
- Each cell shows current/target count
- Color code: green (on target), amber (behind), red (far behind)
- Target per cell derived from site range (e.g., RMH has 100 slots = 10 per group code)

### DEEP-3: Regression/scatter tab in Data Explorer
- X and Y parameter selectors
- Regression line options: Linear, LOESS, Polynomial
- Color by: Age Group, Sex, Site, continuous variable
- R-squared, equation, p-value displayed

### DEEP-4: Sample collection completeness per participant
- Dashboard showing: what % of participants have all expected sample types collected
- Flag incomplete participants

### DEEP-5: ODK clinical data completeness
- How many participants have vitals, DASS-21, MMSE, WHO-QOL, frailty assessment
- Completeness percentages per field

### DEEP-6: Comorbidity prevalence by age group
- DM, HTN, IHD rates across age groups as grouped bar chart
- Important for the aging study context

### DEEP-7: Urban vs Rural breakdown
- If derivable from site (BBH/RMH/CHAF = urban, SSSSMH = rural)

## 4. Lower Priority

### LP-1: Blood report PDF extraction (WS4)
### LP-2: Mobile responsiveness (WS7)
### LP-3: Bundle code-splitting (Plotly behind dynamic import)
### LP-4: PCA analysis tab (needs numpy on backend)

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
