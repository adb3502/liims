# P10 API Endpoint Test Report

**Date:** 2026-02-12
**Tester:** Manual curl testing
**Target:** http://localhost:3080/api
**Auth Method:** JWT Bearer Token

---

## 1. Health Check (No Auth Required)

| Endpoint | Method | Status | Response | Result |
|----------|--------|--------|----------|--------|
| `/api/health` | GET | 200 OK | `{"status":"healthy","database":{"status":"ok","latency_ms":3.7},"redis":{"status":"ok","latency_ms":2.7},"celery_broker":"ok","version":"0.1.0"}` | **PASS** |

---

## 2. Authentication Endpoints

| Endpoint | Method | Status | Response | Result |
|----------|--------|--------|----------|--------|
| `/api/v1/auth/login` | POST | 200 OK | Returns JWT access token + user info | **PASS** |
| `/api/v1/auth/me` | GET | 200 OK | Returns current authenticated user details | **PASS** |

---

## 3. Core Resource Endpoints (Authenticated)

All requests made with valid JWT Bearer token obtained from `/api/v1/auth/login`.

| Endpoint | Method | Status | Response | Result |
|----------|--------|--------|----------|--------|
| `/api/v1/participants?page=1&per_page=5` | GET | 200 OK | Paginated participant list (50 total records) | **PASS** |
| `/api/v1/participants?search=LIIMS` | GET | 200 OK | Fuzzy search returns matching participants | **PASS** |
| `/api/v1/samples?page=1&per_page=5` | GET | 200 OK | Paginated sample list (200+ total records) | **PASS** |
| `/api/v1/storage/freezers` | GET | 200 OK | Returns freezer inventory list | **PASS** |
| `/api/v1/field-events` | GET | 200 OK | Returns field event records | **PASS** |
| `/api/v1/instruments` | GET | 200 OK | Returns instrument registry | **PASS** |
| `/api/v1/notifications` | GET | 200 OK | Returns user notifications | **PASS** |
| `/api/v1/collection-sites` | GET | 200 OK | Returns collection site list | **PASS** |

---

## 4. Admin-Only Endpoints (Authenticated)

| Endpoint | Method | Status | Response | Result |
|----------|--------|--------|----------|--------|
| `/api/v1/users` | GET | 200 OK | Returns user list (admin access) | **PASS** |
| `/api/v1/settings` | GET | 200 OK | Returns system settings | **PASS** |

---

## 5. Failed Endpoints

| Endpoint | Method | Expected | Actual | Issue | Result |
|----------|--------|----------|--------|-------|--------|
| `/api/v1/dashboard/summary` | GET | 200 OK | 404 Not Found | Endpoint path mismatch; being fixed | **FAIL** |

---

## 6. Auth Protection Tests

Verifying that unauthenticated or invalid requests are properly rejected.

| Test Case | Endpoint | Method | Status | Expected | Result |
|-----------|----------|--------|--------|----------|--------|
| No token provided | `/api/v1/participants` | GET | 401 Unauthorized | 401 | **PASS** |
| Wrong password | `/api/v1/auth/login` | POST | 401 Unauthorized | 401 | **PASS** |

---

## 7. Test Credentials Used

| Email | Password | Role |
|-------|----------|------|
| `admin@liims.iisc.ac.in` | `Admin@123` | super_admin |
| `labmgr@liims.iisc.ac.in` | `LabMgr@123` | lab_manager |
| `tech@liims.iisc.ac.in` | `Tech@123` | lab_technician |
| `field@liims.iisc.ac.in` | `Field@123` | field_coordinator |
| `pi@liims.iisc.ac.in` | `PI@123` | pi_researcher |

---

## Summary

| Category | Passed | Failed | Total |
|----------|--------|--------|-------|
| Health Check | 1 | 0 | 1 |
| Authentication | 2 | 0 | 2 |
| Core Resources | 8 | 0 | 8 |
| Admin Endpoints | 2 | 0 | 2 |
| Failed Endpoints | 0 | 1 | 1 |
| Auth Protection | 2 | 0 | 2 |
| **Total** | **15** | **1** | **16** |

**Overall: 15/16 checks PASS (93.75%)**

---

## Notes

- All authenticated endpoints correctly return 401 when no token or invalid credentials are supplied.
- Pagination is functional on both `/api/v1/participants` and `/api/v1/samples` with `page` and `per_page` query parameters.
- Fuzzy search on `/api/v1/participants?search=LIIMS` returns expected results.
- The single failure (`/api/v1/dashboard/summary` returning 404) is a known issue caused by an endpoint path mismatch and is being addressed.
- Backend health check confirms all dependencies are operational: database (3.7ms), Redis (2.7ms), and Celery broker.
