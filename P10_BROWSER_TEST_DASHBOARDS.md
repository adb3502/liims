# P10 Browser Test Report: Dashboards, Reports & Admin

**Date:** 2026-02-12
**Tester:** Automated Browser Test (Playwright MCP)
**App URL:** http://localhost:3080
**Login:** admin@liims.iisc.ac.in / Admin@123 (Super Admin: Dr. Ananya Sharma)

---

## Summary

| Category | Tested | Pass | Fail | Partial |
|----------|--------|------|------|---------|
| Dashboard | 1 | 0 | 1 | 0 |
| Reports | 6 | 2 | 4 | 0 |
| Admin | 6 | 3 | 3 | 0 |
| Notifications | 1 | 1 | 0 | 0 |
| User Profile | 1 | 1 | 0 | 0 |
| **Total** | **15** | **7** | **8** | **0** |

---

## Test Results

### TEST 1: Dashboard Page (`/`)
- **Result:** FAIL (CRITICAL)
- **Details:** Dashboard page crashes with unhandled `TypeError: Cannot read properties of undefined (reading 'recent_30d')`. The React Router default error boundary is displayed instead of the dashboard UI.
- **Root Cause:** The backend API endpoint `/api/v1/dashboard/summary` returns **404 Not Found**. The frontend Dashboard component tries to access `data.recent_30d` from the API response without null-safety checks, causing the crash.
- **Note:** On initial page load (before API call resolves), the dashboard briefly renders correctly showing:
  - "Welcome back, Dr. Ananya Sharma. Super Admin"
  - Summary cards: Total Participants, Total Samples, Storage Utilization, QC Pass Rate
  - Secondary cards: Upcoming Field Events, Active Instrument Runs, Recent Enrollment
  - Dashboard links: Enrollment Dashboard, Inventory Dashboard, Quality Dashboard, Query Builder Dashboard
- **Impact:** This is the default landing page after login. Every login redirects to `/` which crashes, breaking the user experience. Users must manually navigate to another page.
- **Screenshot:** `test-dashboard-crash.png`

### TEST 2: Reports > Enrollment (`/reports/enrollment`)
- **Result:** FAIL
- **Details:** Page layout renders correctly (sidebar, breadcrumbs, Reports submenu visible). Shows error message: "Failed to load enrollment data. Please try again."
- **Root Cause:** Backend API `/api/v1/dashboard/enrollment` returns **404 Not Found**.
- **Positive:** The page handles the API error gracefully with a user-friendly error message instead of crashing.
- **Screenshot:** `test-reports-enrollment-actual.png`

### TEST 3: Reports > Inventory (`/reports/inventory`)
- **Result:** FAIL (CRITICAL)
- **Details:** Page crashes with `TypeError: Cannot read properties of undefined (reading 'toLocaleString')`. React Router default error boundary displayed.
- **Root Cause:** Backend API returns 404; frontend attempts to format undefined data without null checks.
- **Screenshot:** `test-reports-inventory.png`

### TEST 4: Reports > Sites (`/reports/sites`)
- **Result:** FAIL
- **Details:** Route does not exist in the frontend router. Navigating to `/reports/sites` redirects to `/field-ops/events` (fallback behavior).
- **Root Cause:** The sidebar navigation shows a "Sites" link pointing to `/reports/sites`, but the route is not defined in the React Router configuration.

### TEST 5: Reports > Data Availability (`/reports/data-availability`)
- **Result:** FAIL
- **Details:** Route does not exist in the frontend router. Redirects to `/field-ops/events`.
- **Root Cause:** Same as Sites -- sidebar link exists but route is not configured.

### TEST 6: Reports > Quality (`/reports/quality`)
- **Result:** FAIL
- **Details:** Route does not exist in the frontend router. Redirects to `/field-ops/events`.
- **Root Cause:** Same as Sites -- sidebar link exists but route is not configured.

### TEST 7: Reports > Query Builder (`/reports/query-builder`)
- **Result:** PASS
- **Details:** Page loads correctly with:
  - Breadcrumbs: Reports > Query Builder
  - Title: "Query Builder"
  - Description: "Build custom queries against study data with filters, column selection, and export."
  - Data Source selector with radio button options
  - Reports submenu fully visible in sidebar
- **Screenshot:** `test-query-builder.png`

### TEST 8: Admin > Users (`/admin/users`)
- **Result:** PASS (Partial -- Placeholder)
- **Details:** Page loads correctly with layout, breadcrumbs. Shows "User Management" heading with message: "This page is under development."
- **Admin submenu visible:** Users, Read Replica, Audit Logs, Access Logs, File Manager, Scheduled Reports
- **Screenshot:** `test-admin-users-v2.png`

### TEST 9: Admin > System Settings (`/admin/settings`)
- **Result:** PASS (Partial -- Placeholder)
- **Details:** Page loads correctly with layout, breadcrumbs. Shows "System Settings" heading with message: "This page is under development."
- **Screenshot:** `test-admin-settings.png`

### TEST 10: Admin > Audit Logs (`/admin/audit-logs`)
- **Result:** FAIL
- **Details:** Route does not exist. Navigating to `/admin/audit-logs` redirects to `/field-ops/events`.
- **Note:** The sidebar shows "Audit Logs" link but the route is not configured. Tried `/admin/audit-log` which shows "Page not found" within the admin layout.

### TEST 11: Admin > Access Logs (`/admin/access-logs`)
- **Result:** PASS (Partial -- Placeholder)
- **Details:** Page loads correctly showing "Access Logs" heading with "This page is under development."

### TEST 12: Admin > File Manager (`/admin/file-manager`)
- **Result:** FAIL
- **Details:** Shows "Page not found -- The page you are looking for does not exist or you may not have permission to view it." within the admin layout.

### TEST 13: Admin > Read Replica (`/admin/read-replica`)
- **Result:** FAIL
- **Details:** Shows "Page not found" within the admin layout.

### TEST 14: Notifications Bell Icon
- **Result:** PASS
- **Details:** Clicking the bell icon in the header opens a dropdown popup with:
  - "Notifications" header
  - "No notifications" empty state message
- Dropdown renders properly overlaid on the page content and is dismissible.
- **Screenshot:** `test-notifications.png`

### TEST 15: User Profile Dropdown
- **Result:** PASS
- **Details:** Clicking the user avatar/name in the header opens a dropdown with:
  - User name: "Dr. Ananya Sharma"
  - Email: "admin@liims.iisc.ac.in"
  - "Profile" link
  - "Settings" link
  - "Log out" link (with arrow icon)
- **Screenshot:** `test-user-profile-dropdown.png`

---

## Critical Issues Summary

### CRITICAL Bugs (Application Crashes)

| ID | Page | Error | Root Cause |
|----|------|-------|------------|
| D-C-01 | Dashboard (`/`) | `TypeError: Cannot read properties of undefined (reading 'recent_30d')` | `/api/v1/dashboard/summary` returns 404. Frontend lacks null-safety. |
| D-C-02 | Reports > Inventory (`/reports/inventory`) | `TypeError: Cannot read properties of undefined (reading 'toLocaleString')` | Dashboard inventory API returns 404. Frontend lacks null-safety. |

### HIGH Priority (Missing Routes)

| ID | Page | Issue |
|----|------|-------|
| D-H-01 | Reports > Sites (`/reports/sites`) | Route not defined in React Router; sidebar link exists |
| D-H-02 | Reports > Data Availability (`/reports/data-availability`) | Route not defined in React Router; sidebar link exists |
| D-H-03 | Reports > Quality (`/reports/quality`) | Route not defined in React Router; sidebar link exists |
| D-H-04 | Admin > Audit Logs (`/admin/audit-logs`) | Route not defined in React Router; sidebar link exists |
| D-H-05 | Admin > File Manager (`/admin/file-manager`) | Route shows "Page not found" |
| D-H-06 | Admin > Read Replica (`/admin/read-replica`) | Route shows "Page not found" |

### MEDIUM Priority (API Endpoints Missing)

| ID | Endpoint | Status |
|----|----------|--------|
| D-M-01 | `GET /api/v1/dashboard/summary` | 404 Not Found |
| D-M-02 | `GET /api/v1/dashboard/enrollment` | 404 Not Found |
| D-M-03 | `GET /api/v1/dashboard/` | 404 Not Found |
| D-M-04 | `GET /api/v1/dashboard/stats` | 404 Not Found |
| D-M-05 | `GET /api/v1/reports/` | 404 Not Found |
| D-M-06 | `GET /api/v1/reports/enrollment` | 404 Not Found |

### LOW Priority (Placeholder Pages)

| ID | Page | Issue |
|----|------|-------|
| D-L-01 | Admin > Users | Shows "under development" placeholder |
| D-L-02 | Admin > Settings | Shows "under development" placeholder |
| D-L-03 | Admin > Access Logs | Shows "under development" placeholder |

---

## Recommendations

1. **Immediate Fix (D-C-01, D-C-02):** Add null-safety/optional chaining in Dashboard and Inventory report components. The frontend should gracefully handle missing or error API responses instead of crashing.

2. **Backend Dashboard API:** Register the `/api/v1/dashboard/` router in the FastAPI app. The dashboard routes (summary, enrollment, inventory) appear to be defined in backend code but not mounted in the main app router.

3. **Missing Frontend Routes:** Add React Router route definitions for:
   - `/reports/sites`
   - `/reports/data-availability`
   - `/reports/quality`
   - `/admin/audit-logs`
   - `/admin/file-manager`
   - `/admin/read-replica`

   These can be placeholder pages initially, but the routes must exist to avoid confusing redirects when sidebar links are clicked.

4. **Error Boundary:** Add a proper React `ErrorBoundary` or `errorElement` to routes to prevent unhandled crashes from displaying raw stack traces.

5. **Post-Login Redirect:** Since the dashboard crashes, consider redirecting to `/participants` after login as a temporary workaround until the dashboard is fixed.
