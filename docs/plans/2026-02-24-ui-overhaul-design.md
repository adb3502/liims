# LIMS UI Overhaul & Feature Completion — Design Document

**Date**: 2026-02-24
**Status**: Merged to master (2026-03-13) — see completion notes per workstream below
**Branch**: feature/ui-overhaul → master

---

## Overview

Complete overhaul of the LIMS frontend for the Longevity India (BHARAT) Study. Transform from functional prototype to production-ready, aesthetically polished application with rich data dashboards, complete feature coverage, and mobile responsiveness.

## Workstreams

### WS1: UI/UX Foundation ✅ DONE
- ✅ Recharts, Plotly.js, React-Leaflet, TanStack Table installed
- ✅ Longevity India branding theme (gradient #3674F6 → #03B6D9)
- ✅ ChartCard with 4 states, stat cards
- ✅ Sidebar with gradient background, collapse animation
- ✅ Self-hosted Red Hat Display + JetBrains Mono (offline-capable)

### WS2: Data Dashboards ✅ DONE (except PCA)
1. ✅ **Overview Dashboard**: KPI cards, enrollment trend, pin code participant map (Leaflet/CartoDB), site map, monthly summary
2. ✅ **Enrollment Analytics**: Demographics, age×sex matrix, 10 group-code matrix per site (with targets), per-site drill-down pages at `/reports/enrollment/sites/:siteCode`
3. ✅ **Data Explorer**: Box/violin/density/histogram/scatter plots, correlation heatmap, Color By, cohort filters, strata stratification, metadata table (MetadataExplorerPage)
4. ✅ **Quality & Lab**: QC rates, processing timelines, freezer gauges, sample type donuts
5. ✅ **Field Operations**: Event timeline, check-in rates
6. ❌ **Advanced Analytics / PCA**: placeholder — requires numpy/scikit-learn on backend

### WS3: Participant Management ✅ DONE (range creation not built)
- ✅ Clinical data viewer on detail page (vitals, anthropometry, comorbidities, ODK scores)
- ✅ Lab results tab with partner lab results per participant
- ✅ Enhanced list with filters
- ❌ Range creation UI ("1A-001 to 1A-050" bulk create) — not built

### WS4: Blood Report Extraction ❌ NOT STARTED
- PDF upload endpoint for partner lab reports
- Backend pdfplumber parsing

### WS5: Protocols/SOP Page ✅ DONE
- ✅ Browsable protocol library at `/protocols`

### WS6: Feature Completion ✅ DONE
- ✅ User Management (list, create, edit, role assignment, deactivate) — with BHARAT role names
- ✅ Audit Logs — searchable, filterable timeline
- ✅ System Settings
- ✅ Stool Kit Tracker
- ✅ Instrument Dashboard, Plates, Runs
- ✅ Query Builder
- ✅ Notifications page
- ✅ Import Wizard + History
- ✅ File Manager (NAS file browser)

### WS7: Mobile/Tablet + Responsive ❌ NOT STARTED
- All pages desktop-only currently
- PWA manifest exists; service worker registers; background sync queue built

## Tech Stack Additions
- recharts: Standard charts (bar, line, area, pie, radar)
- plotly.js + react-plotly.js: Heatmaps, PCA, correlation matrices
- react-leaflet + leaflet: Site maps
- framer-motion: Page/component animations
- @tanstack/react-table: Advanced data tables
- pdfplumber (backend): PDF text extraction

## Priority Order
1. WS1 (foundation) → 2. WS2 (dashboards) → 3. WS3 (participants) → 4. WS6 (features) → 5. WS5 (protocols) → 6. WS4 (reports) → 7. WS7 (mobile)

## Data
- 994 real participants, 61K+ lab results, 457 ODK submissions
- All dashboards use real data from existing API endpoints
- New backend endpoints only needed for: range participant creation, blood report extraction, SOP serving

## Browser Testing
- Playwright MCP after each workstream
- Test: navigation, data loading, chart rendering, responsive breakpoints, form submissions
