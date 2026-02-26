# LIMS UI Overhaul & Feature Completion — Design Document

**Date**: 2026-02-24
**Status**: Approved
**Branch**: feature/ui-overhaul

---

## Overview

Complete overhaul of the LIMS frontend for the Longevity India (BHARAT) Study. Transform from functional prototype to production-ready, aesthetically polished application with rich data dashboards, complete feature coverage, and mobile responsiveness.

## Workstreams

### WS1: UI/UX Foundation
- Install Recharts, Plotly.js, React-Leaflet, Framer Motion, TanStack Table
- Create unified theme with Longevity India branding (gradient #3674F6 → #03B6D9)
- Glassmorphism card components, animated stat cards with sparklines
- Page transition animations
- Consistent color palette for all data visualizations
- Redesign sidebar with gradient background, smooth collapse animation

### WS2: Data Dashboards (6 tabs, inspired by Shiny app)
1. **Overview Dashboard**: KPI cards with sparklines, enrollment trend chart, site map (Leaflet), recent activity
2. **Enrollment Analytics**: Demographics pyramid, age×sex distribution, site comparison, monthly trends
3. **Blood Biochemistry Explorer**: Parameter distribution (box/violin/histogram), scatter+regression, correlation heatmap, cohort filters
4. **Quality & Lab**: QC rates, processing timelines, freezer gauges, sample type breakdown donuts
5. **Field Operations**: Event timeline, check-in rates, site performance
6. **Advanced Analytics**: PCA biplot, variable loadings table (PI/researcher role)

### WS3: Participant Management
- Range creation: "1A-001 to 1A-050" bulk creates participants
- Clinical data viewer on detail page (vitals, anthropometry, comorbidities, scores from ODK)
- Lab results tab with all partner lab results per participant
- Enhanced list with advanced filters, export

### WS4: Blood Report Extraction
- PDF upload endpoint for partner lab reports
- Backend pdfplumber parsing for structured lab PDFs
- Auto-mapping extracted values to canonical tests
- Review/confirm UI before committing results

### WS5: Protocols/SOP Page
- Read 11 BHARAT SOP documents from bharat-sop folder
- Browsable protocol library with search and categories
- PDF/DOCX viewer embedded in page

### WS6: Feature Completion (all placeholder pages)
- User Management: list, create, edit, role assignment, deactivate
- Audit Logs: searchable, filterable timeline
- System Settings: grouped settings editor
- Stool Kit Tracker: issue, track, return workflow
- Instrument Dashboard: utilization charts, run status
- Query Builder: visual query interface with export
- Notifications: full page with mark-read, filters
- Import Wizard: step-by-step partner data import
- File Manager: NAS file browser with associations

### WS7: Mobile/Tablet + Responsive
- All pages responsive (sm/md/lg breakpoints)
- Touch-friendly controls, larger tap targets
- Collapsible sidebar as bottom nav on mobile
- PWA manifest, offline indicators

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
