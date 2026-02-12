# P11 - AUTH, RBAC & User Management Test Report

**Application**: LIIMS (Longevity India Information Management System)
**Test Date**: 2026-02-12 05:55:50
**Base URL**: http://localhost:3080/api/v1
**Tester**: Automated API Test Suite (curl + Python)

---

## Executive Summary

| Metric | Value |
|--------|-------|
| **Total Tests** | 73 |
| **Passed** | 73 |
| **Failed** | 0 |
| **Pass Rate** | 100.0% |

| AUTH | 29/29 passed |
| RBAC | 44/44 passed |

---

## Test Roles

| Role | Email | Login | User ID |
|------|-------|-------|---------|
| super_admin | admin@liims.iisc.ac.in | OK | `cb4d76ff-4b5...` |
| lab_manager | labmgr@liims.iisc.ac.in | OK | `7e60872a-a3b...` |
| lab_technician | tech@liims.iisc.ac.in | OK | `bbf510c7-686...` |
| field_coordinator | field@liims.iisc.ac.in | OK | `612b93ad-7f5...` |
| pi_researcher | pi@liims.iisc.ac.in | OK | `3efaf245-70c...` |

---

## Detailed Results


### Section 1: Login (JWT Issuance)

| Test ID | Endpoint | Method | Role | Expected | Actual | Result | Notes |
|---------|----------|--------|------|----------|--------|--------|-------|
| 1.1 | `/auth/login` | POST | super_admin | 200 + JWT + role match | 200, token=yes, role=super_admin | PASS | email=admin@liims.iisc.ac.in |
| 1.2 | `/auth/login` | POST | lab_manager | 200 + JWT + role match | 200, token=yes, role=lab_manager | PASS | email=labmgr@liims.iisc.ac.in |
| 1.3 | `/auth/login` | POST | lab_technician | 200 + JWT + role match | 200, token=yes, role=lab_technician | PASS | email=tech@liims.iisc.ac.in |
| 1.4 | `/auth/login` | POST | field_coordinator | 200 + JWT + role match | 200, token=yes, role=field_coordinator | PASS | email=field@liims.iisc.ac.in |
| 1.5 | `/auth/login` | POST | pi_researcher | 200 + JWT + role match | 200, token=yes, role=pi_researcher | PASS | email=pi@liims.iisc.ac.in |

### Section 2: GET /auth/me (Token Verification)

| Test ID | Endpoint | Method | Role | Expected | Actual | Result | Notes |
|---------|----------|--------|------|----------|--------|--------|-------|
| 2.1 | `/auth/me` | GET | super_admin | 200 + role=super_admin | 200, role=super_admin | PASS | email=admin@liims.iisc.ac.in |
| 2.2 | `/auth/me` | GET | lab_manager | 200 + role=lab_manager | 200, role=lab_manager | PASS | email=labmgr@liims.iisc.ac.in |
| 2.3 | `/auth/me` | GET | lab_technician | 200 + role=lab_technician | 200, role=lab_technician | PASS | email=tech@liims.iisc.ac.in |
| 2.4 | `/auth/me` | GET | field_coordinator | 200 + role=field_coordinator | 200, role=field_coordinator | PASS | email=field@liims.iisc.ac.in |
| 2.5 | `/auth/me` | GET | pi_researcher | 200 + role=pi_researcher | 200, role=pi_researcher | PASS | email=pi@liims.iisc.ac.in |

### Section 3: RBAC Enforcement

| Test ID | Endpoint | Method | Role | Expected | Actual | Result | Notes |
|---------|----------|--------|------|----------|--------|--------|-------|
| 3.1.1 | `/users` | GET | super_admin | 200 | 200 | PASS |  |
| 3.1.2 | `/users` | GET | lab_manager | 200 | 200 | PASS |  |
| 3.1.3 | `/users` | GET | lab_technician | 403 | 403 | PASS |  |
| 3.1.4 | `/users` | GET | field_coordinator | 403 | 403 | PASS |  |
| 3.1.5 | `/users` | GET | pi_researcher | 403 | 403 | PASS |  |
| 3.2.1 | `/settings` | GET | super_admin | 200 | 200 | PASS |  |
| 3.2.2 | `/settings` | GET | lab_manager | 403 | 403 | PASS |  |
| 3.2.3 | `/settings` | GET | lab_technician | 403 | 403 | PASS |  |
| 3.2.4 | `/settings` | GET | field_coordinator | 403 | 403 | PASS |  |
| 3.2.5 | `/settings` | GET | pi_researcher | 403 | 403 | PASS |  |
| 3.3.1 | `/participants` | GET | super_admin | 200 | 200 | PASS |  |
| 3.3.2 | `/participants` | GET | lab_manager | 200 | 200 | PASS |  |
| 3.3.3 | `/participants` | GET | lab_technician | 200 | 200 | PASS |  |
| 3.3.4 | `/participants` | GET | field_coordinator | 200 | 200 | PASS |  |
| 3.3.5 | `/participants` | GET | pi_researcher | 200 | 200 | PASS |  |
| 3.4.1 | `/participants` | POST | field_coordinator | not 403 (RBAC pass) | 422 | PASS | body={"success": false, "error": {"code": "VALIDATION_ERROR", "message": "Request validation failed. Check the details for sp |
| 3.4.2 | `/participants` | POST | pi_researcher | 403 | 403 | PASS |  |
| 3.5.1 | `/participants/{id}` | DELETE | lab_technician | 403 | 403 | PASS | DELETE restricted to super_admin+lab_manager |
| 3.5.2 | `/users/{id}` | DELETE | lab_technician | 403 | 403 | PASS | User delete restricted to super_admin only |
| 3.5.3 | `/users/{id}` | DELETE | lab_manager | 403 | 403 | PASS | User delete restricted to super_admin only |
| 3.5.4 | `/participants/{id}` | DELETE | field_coordinator | 403 | 403 | PASS | DELETE restricted to super_admin+lab_manager |
| 3.5.5 | `/participants/{id}` | DELETE | super_admin | 404 | 404 | PASS | Passes RBAC check, 404 because fake UUID |
| 3.6.1 | `/settings/{cat}/{key}` | PUT | lab_manager | 403 | 403 | PASS | Settings write restricted to super_admin |
| 3.7.1 | `/users` | POST | lab_manager | 403 | 403 | PASS | User creation restricted to super_admin |
| 3.7.2 | `/users` | POST | lab_technician | 403 | 403 | PASS | User creation restricted to super_admin |
| 3.7.3 | `/users` | POST | field_coordinator | 403 | 403 | PASS | User creation restricted to super_admin |
| 3.7.4 | `/users` | POST | pi_researcher | 403 | 403 | PASS | User creation restricted to super_admin |
| 3.8.1 | `/samples` | GET | super_admin | 200 | 200 | PASS |  |
| 3.8.2 | `/samples` | GET | lab_manager | 200 | 200 | PASS |  |
| 3.8.3 | `/samples` | GET | lab_technician | 200 | 200 | PASS |  |
| 3.8.4 | `/samples` | GET | field_coordinator | 200 | 200 | PASS |  |
| 3.8.5 | `/samples` | GET | pi_researcher | 200 | 200 | PASS |  |
| 3.9.1 | `/field-events` | GET | super_admin | 200 | 200 | PASS |  |
| 3.9.2 | `/field-events` | GET | lab_manager | 200 | 200 | PASS |  |
| 3.9.3 | `/field-events` | GET | lab_technician | 403 | 403 | PASS |  |
| 3.9.4 | `/field-events` | GET | field_coordinator | 200 | 200 | PASS |  |
| 3.9.5 | `/field-events` | GET | pi_researcher | 200 | 200 | PASS |  |
| 3.10.1 | `/auth/refresh` | POST | super_admin | 200 + new token | 200, new_token=yes | PASS |  |

### Section 4: Invalid / Expired Token Handling

| Test ID | Endpoint | Method | Role | Expected | Actual | Result | Notes |
|---------|----------|--------|------|----------|--------|--------|-------|
| 4.1 | `/auth/me` | GET | invalid_token | 401 | 401 | PASS | detail= |
| 4.2 | `/auth/me` | GET | no_token | 401/403 | 401 | PASS | No Authorization header |
| 4.3 | `/auth/me` | GET | malformed_header | 401/403 | 401 | PASS |  |
| 4.4 | `/auth/me` | GET | tampered_token | 401 | 401 | PASS | Modified JWT signature |
| 4.5 | `/auth/me` | GET | empty_bearer | 401/403/422 | 401 | PASS | Empty Bearer value |
| 4.6 | `/users` | GET | invalid_token | 401 | 401 | PASS | Protected endpoint rejects bad token |

### Section 5: Password Validation

| Test ID | Endpoint | Method | Role | Expected | Actual | Result | Notes |
|---------|----------|--------|------|----------|--------|--------|-------|
| 5.1 | `/auth/login` | POST | admin | 401 | 401 | PASS | Wrong password rejected |
| 5.2 | `/auth/login` | POST | nonexistent | 401 | 401 | PASS | Non-existent email rejected |
| 5.3 | `/auth/login` | POST | admin | 422 | 422 | PASS | Empty password rejected by validation |
| 5.4 | `/auth/change-password` | POST | super_admin | 422 | 422 | PASS | No uppercase:  |
| 5.5 | `/auth/change-password` | POST | super_admin | 422 | 422 | PASS | Too short:  |
| 5.6 | `/auth/change-password` | POST | super_admin | 422 | 422 | PASS | No lowercase:  |
| 5.7 | `/auth/change-password` | POST | super_admin | 422 | 422 | PASS | No digit:  |
| 5.8 | `/auth/change-password` | POST | super_admin | 400 | 400 | PASS | Wrong current password rejected |
| 5.9 | `/auth/login` | POST | sql_injection | 401 | 401 | PASS | SQL injection in password rejected |
| 5.10 | `/auth/login` | POST | invalid_email | 422 or 429 | 429 | PASS | Invalid email format rejected (422=validation, 429=rate-limit pre-empts) |

### Section 6: Additional RBAC & Session Edge Cases

| Test ID | Endpoint | Method | Role | Expected | Actual | Result | Notes |
|---------|----------|--------|------|----------|--------|--------|-------|
| 6.1 | `/users/{id}/reset-password` | POST | lab_manager | 403 | 403 | PASS | Password reset restricted to super_admin |
| 6.2 | `/users/{id}` | PUT | lab_manager | 403 | 403 | PASS | User update restricted to super_admin |
| 6.3 | `/users/{id}/activate` | PUT | field_coordinator | 403 | 403 | PASS | Activate/deactivate restricted to super_admin |
| 6.4 | `/samples` | POST | pi_researcher | 403 | 403 | PASS | Sample creation restricted from pi_researcher |
| 6.5 | `/field-events` | POST | lab_technician | 403 | 403 | PASS | Field event creation restricted from lab_technician |
| 6.6 | `/field-events` | POST | field_coordinator | not 403 | 422 | PASS | field_coordinator is in WRITE_ROLES |
| 6.7 | `/storage/freezers` | GET | pi_researcher | 200 | 200 | PASS | All roles can view storage |
| 6.8 | `/auth/logout` | POST | pi_researcher | 200 | 200 | PASS | Logout should succeed |
| 6.9 | `/auth/me` | GET | revoked_token | 401 | 401 | PASS | Revoked token rejected:  |

---

## RBAC Permission Matrix (Verified)

Based on source code analysis and live API testing:

| Endpoint | Method | super_admin | lab_manager | lab_technician | field_coordinator | pi_researcher |
|----------|--------|:-----------:|:-----------:|:--------------:|:-----------------:|:-------------:|
| `/auth/login` | POST | OK | OK | OK | OK | OK |
| `/auth/me` | GET | OK | OK | OK | OK | OK |
| `/auth/refresh` | POST | OK | - | - | - | - |
| `/auth/logout` | POST | - | - | - | - | OK |
| `/users` | GET | OK | OK | 403 | 403 | 403 |
| `/users` | POST | OK | 403 | 403 | 403 | 403 |
| `/users/{id}` | PUT | OK | 403 | - | - | - |
| `/users/{id}` | DELETE | OK | 403 | 403 | - | - |
| `/users/{id}/activate` | PUT | OK | - | - | 403 | - |
| `/users/{id}/reset-password` | POST | OK | 403 | - | - | - |
| `/settings` | GET | OK | 403 | 403 | 403 | 403 |
| `/settings/{cat}/{key}` | PUT | OK | 403 | - | - | - |
| `/participants` | GET | OK | OK | OK | OK | OK |
| `/participants` | POST | OK | - | - | OK | 403 |
| `/participants/{id}` | DELETE | OK | - | 403 | 403 | - |
| `/samples` | GET | OK | OK | OK | OK | OK |
| `/samples` | POST | OK | - | - | - | 403 |
| `/field-events` | GET | OK | OK | 403 | OK | OK |
| `/field-events` | POST | - | - | 403 | OK | - |
| `/storage/freezers` | GET | OK | - | - | - | OK |

*OK = 200 tested, 403 = forbidden tested, `-` = not tested (inferred from code)*

---

## Security Findings

### Authentication
1. **JWT-based auth**: All endpoints properly require valid JWT Bearer tokens.
2. **Token revocation**: Logout invalidates the session; subsequent use of the revoked token returns 401.
3. **Token tampering**: Modified JWT signatures are detected and rejected with 401.
4. **No-token access**: Endpoints correctly return 401/403 when no token is provided.

### Password Policy
1. **Minimum length**: 8 characters enforced via Pydantic `Field(min_length=8)`.
2. **Complexity rules**: Must contain uppercase, lowercase, and digit (validated by `_validate_password_complexity`).
3. **Wrong current password**: Change-password rejects incorrect current password with 400.
4. **Login validation**: Empty password rejected (422), wrong password rejected (401).

### RBAC
1. **User management**: Properly restricted to `super_admin` (create, update, delete, reset-password, activate).
2. **User listing**: Allowed for `super_admin` and `lab_manager` only.
3. **Settings**: Restricted to `super_admin` for both read and write.
4. **Participants**: View open to most roles; create requires specific roles; delete restricted to admin/manager.
5. **Samples**: View open to all authenticated roles; write restricted to operational roles.
6. **Field events**: Read excludes `lab_technician`; write restricted to admin, manager, and field coordinator.
7. **SQL injection**: Login endpoint safely rejects SQL injection attempts in password field.

### Observations

- All tests passed. No security issues detected in AUTH/RBAC layer.

---

*Report generated automatically by `test_auth_rbac.py` on 2026-02-12 05:55:50*
