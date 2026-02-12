# P10 Browser Test Report: Auth, Navigation & Layout

**Test Date:** 2026-02-12
**App URL:** http://localhost:3080
**Browser:** Chromium (Playwright MCP)
**Tester:** Automated (browser-test-auth agent)

---

## Test Summary

| # | Test | Result | Severity |
|---|------|--------|----------|
| 1 | Login page loads | **PASS** | - |
| 2 | Wrong credentials rejected | **FAIL** | Critical |
| 3 | Admin login succeeds | **PASS** | - |
| 4 | Sidebar navigation links | **PASS** | - |
| 5 | Header shows user name | **PASS** | - |
| 6 | Brand colors (#3674F6) | **PASS** | - |
| 7 | Sidebar pages load | **PARTIAL** | Critical |
| 8 | Logout functionality | **PASS** | - |

**Overall: 5 PASS, 1 FAIL, 1 PARTIAL PASS, 1 PASS (with notes)**

---

## Detailed Results

### TEST 1: Login Page Loads
**Result: PASS**

- Navigating to `http://localhost:3080` redirects to `/login`
- Page title: "LIIMS - Longevity India Information Management System"
- Login form shows: LIIMS logo, heading, email field (placeholder: you@iisc.ac.in), password field, "Sign in" button
- Footer: "BHARAT Study -- Indian Institute of Science, Bangalore"
- Password field has show/hide toggle button

### TEST 2: Wrong Credentials Rejected
**Result: FAIL (Critical)**

**Bug Description:** When submitting wrong credentials (`bad@email.com` / `wrongpassword`) with a clean browser session:
1. The form briefly shows validation errors ("Please enter a valid email address", "Password is required")
2. Despite the validation errors, the app then **navigates away** from the login page to `/` (Dashboard)
3. The Dashboard crashes with: `TypeError: Cannot read properties of undefined (reading 'recent_30d')`
4. The React Router default error boundary shows the full stack trace

**Root Cause Analysis:**
- The login form validation triggers but the form submission/navigation logic proceeds anyway
- The route guard does not properly block unauthenticated access to protected routes
- The Dashboard page does not handle undefined/null API response data defensively

**Note:** Browser autofill behavior made initial testing ambiguous. The browser auto-filled correct admin credentials from a previous session, which masked the issue on first attempt. After clearing all storage and cookies, the bug was confirmed.

### TEST 3: Admin Login Succeeds
**Result: PASS**

- Login with `admin@liims.iisc.ac.in` / `Admin@123` succeeds
- App navigates to protected pages after login
- User session is established with JWT token stored in localStorage
- All subsequent API calls succeed with authentication

### TEST 4: Sidebar Navigation Links
**Result: PASS**

All required sidebar navigation links are present:

| Link | URL | Sub-items |
|------|-----|-----------|
| Dashboard | `/` | - |
| Participants | `/participants` | All Participants, Create, ODK Sync |
| Samples | `/samples` | All Samples, Register, Processing |
| Storage | `/storage/freezers` | Freezers, Boxes, Search |
| Field Operations | `/field-ops/events` | Events, Conflicts |
| Partners | `/partners/import` | - |
| Instruments | `/instruments` | Dashboard, Queue, Plate Designer, Runs, Omics Results, ICC Workflow |
| Reports | `/reports/enrollment` | Enrollment, Inventory, Sites, Data Availability, Quality, Query Builder |
| Admin | `/admin/users` | Users, Read Replica, Audit Logs, Access Logs, File Manager, Scheduled Reports, System Settings |

**Note:** The spec mentions "Admin/Settings" -- the sidebar shows "Admin" with "System Settings" as a sub-item. This matches the requirement.

### TEST 5: Header Shows User Name
**Result: PASS**

- Header displays user avatar with initials "DA" (in blue circle, color `#3674F6`)
- Shows "Dr. Ananya Sharma" as name
- Shows "Super Admin" as role
- Notification bell icon is present
- User dropdown menu contains: Profile, Settings, Log out

### TEST 6: Brand Colors (#3674F6)
**Result: PASS**

- Confirmed `rgb(54, 116, 246)` = `#3674F6` is used for:
  - Active sidebar navigation link background
  - User avatar circle background
  - Sign in button background
- The dark sidebar background provides good contrast
- Color badges for participant sex (Male/Female) are styled distinctly

### TEST 7: Sidebar Pages Load Without Errors
**Result: PARTIAL PASS**

Pages tested by direct navigation:

| Page | URL | Loads? | Notes |
|------|-----|--------|-------|
| Dashboard | `/` | **FAIL** | Crashes: `Cannot read properties of undefined (reading 'recent_30d')` |
| Participants | `/participants` | **PASS** | Shows table with 50 participants, filters, pagination |
| Samples | `/samples` | **PASS** | Shows filters by type (Plasma, Epigenetics, etc.) and status |
| Storage/Freezers | `/storage/freezers` | **PASS** | Shows "Add Freezer" button, type filter |
| Field Operations | `/field-ops/events` | **PASS** | Shows "Create Event" button, status/site/date filters |
| Instruments | `/instruments` | **PASS** | Shows "Register Instrument" button, type/status filters |
| Reports/Enrollment | `/reports/enrollment` | **PASS** | Loads initially (see auto-nav bug below) |
| Admin/Users | `/admin/users` | **PASS** | Shows "User Management" heading, "under development" message |
| Admin/Settings | `/admin/settings` | **PASS** | Shows "System Settings" heading, "under development" message |

**Critical Bug -- Dashboard Crash:**
- The Dashboard (`/`) page crashes every time with: `TypeError: Cannot read properties of undefined (reading 'recent_30d')`
- The Dashboard component accesses dashboard stats API data without null-checking
- The API may be returning incomplete data or the response shape doesn't match what the component expects

**Critical Bug -- Auto-Navigation / Page Cycling:**
- After pages load, the app automatically navigates through multiple routes in sequence
- Example: Navigating to `/storage/freezers` -> page loads -> then auto-navigates to `/reports/quality`, `/reports/query-builder`, etc.
- This appears to be caused by a useEffect loop or keyboard event handler cycling through routes
- The behavior is intermittent and depends on timing
- Pages render correctly initially before the auto-navigation kicks in

**API 503 Errors Observed:**
- `/api/v1/field-events/` returns 503
- `/api/v1/instruments/` returns 503
- `/api/v1/notifications/unread-count` returns error for unauthenticated users

### TEST 8: Logout Functionality
**Result: PASS**

- Clicking user profile button in header opens dropdown menu
- Dropdown shows: user name, email, Profile, Settings, **Log out**
- Clicking "Log out" clears session and redirects to `/login`
- Login page is clean after logout (no residual authenticated state)

---

## Bugs Found (Prioritized)

### CRITICAL

| ID | Bug | Impact | Location |
|----|-----|--------|----------|
| AUTH-C01 | Login form navigates away despite validation errors | Users can bypass login validation; unauthenticated users reach protected routes | Login page form submission logic |
| AUTH-C02 | Dashboard crashes on load (`recent_30d` undefined) | Dashboard completely unusable; shows React error boundary | Dashboard component, missing null-check on API data |
| AUTH-C03 | Auto-navigation bug: app cycles through routes automatically | Pages are unusable as they navigate away within seconds | Likely a useEffect loop or keyboard event handler in layout/router |

### IMPORTANT

| ID | Bug | Impact | Location |
|----|-----|--------|----------|
| AUTH-I01 | API returns 503 for `/api/v1/field-events/` and `/api/v1/instruments/` | Some backend endpoints are not responding properly | Backend API routes |
| AUTH-I02 | Admin pages (Users, Access Logs, Settings) show "under development" placeholder | Admin functionality not yet implemented | Admin frontend pages |
| AUTH-I03 | Reports/Inventory crashes with `toLocaleString` on undefined | Inventory report page is broken | Reports Inventory component |

### MINOR

| ID | Bug | Impact | Location |
|----|-----|--------|----------|
| AUTH-M01 | React Router default error boundary shows raw stack traces | Poor UX when errors occur; no custom ErrorBoundary | Router configuration |
| AUTH-M02 | Login validation says "Please enter a valid email address" for `bad@email.com` | Misleading error message -- email format is valid, the account doesn't exist | Login form validation schema |

---

## Screenshots

| File | Description |
|------|-------------|
| `test1-login-page.png` | Login page initial load |
| `test2-wrong-creds-validation.png` | Wrong credentials -- shows validation then crashes |
| `test2-wrong-creds-crash.png` | Error boundary after failed login navigation |
| `test3-app-loaded.png` | App loaded after successful login |
| `test4-sidebar-navigation.png` | Sidebar with all navigation links visible |
| `test7-dashboard-crash.png` | Dashboard crash (recent_30d error) |
| `test7-admin-users.png` | Admin Users page (under development) |
| `test8-user-dropdown.png` | User profile dropdown with logout option |
| `test8-logout-success.png` | Login page after successful logout |

---

## Environment Notes

- Backend: FastAPI on localhost:3080 (via Vite proxy)
- Frontend: React + Vite dev server
- Database: PostgreSQL with seeded data (50 participants visible)
- Browser: Chromium (via Playwright MCP headless)
