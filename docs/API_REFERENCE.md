# LIIMS API Reference

**Version:** 0.1.0
**Base URL:** `/api/v1`
**Authentication:** Bearer JWT token (send as `Authorization: Bearer <token>`)

All responses use a standard envelope:

```json
{
  "success": true,
  "data": { ... },
  "meta": { "page": 1, "per_page": 20, "total": 100, "total_pages": 5 }
}
```

Error responses:

```json
{
  "detail": "Error message here."
}
```

---

## Table of Contents

1. [Auth](#1-auth)
2. [Users](#2-users)
3. [Participants](#3-participants)
4. [Samples](#4-samples)
5. [Storage](#5-storage)
6. [Field Events](#6-field-events)
7. [Instruments](#7-instruments)
8. [ICC (Immunocytochemistry)](#8-icc)
9. [Dashboard](#9-dashboard)
10. [Reports](#10-reports)
11. [Query Builder](#11-query-builder)
12. [Files](#12-files)
13. [Sync](#13-sync)
14. [Partner](#14-partner)
15. [Notifications](#15-notifications)
16. [Collection Sites](#16-collection-sites)
17. [Transports](#17-transports)
18. [Labels](#18-labels)
19. [QR Codes](#19-qr-codes)
20. [Settings](#20-settings)

---

## 1. Auth

Prefix: `/api/v1/auth`

| Method | Path | Auth Required | Rate Limit | Description |
|--------|------|---------------|------------|-------------|
| POST | `/auth/login` | No | 10/min per IP | Authenticate and receive JWT |
| POST | `/auth/refresh` | Yes | - | Refresh JWT token (silent refresh) |
| POST | `/auth/logout` | Yes | - | Revoke current session |
| POST | `/auth/change-password` | Yes | - | Change current user's password |
| POST | `/auth/forgot-password` | No | - | Request password reset link |
| POST | `/auth/reset-password` | No | - | Reset password using token |
| GET | `/auth/me` | Yes | - | Get current user profile |

### POST /auth/login

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "secret123"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "access_token": "eyJ...",
    "token_type": "bearer",
    "expires_in": 86400,
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "full_name": "John Doe",
      "role": "lab_manager",
      "is_active": true,
      "last_login": "2025-01-01T00:00:00Z"
    }
  }
}
```

**Account Lockout:** After too many failed attempts, account is locked for 15 minutes.

### POST /auth/change-password

**Request Body:**

```json
{
  "current_password": "old_password",
  "new_password": "new_password"
}
```

### POST /auth/forgot-password

**Request Body:**

```json
{
  "email": "user@example.com"
}
```

Always returns success to prevent email enumeration.

### POST /auth/reset-password

**Request Body:**

```json
{
  "token": "reset_token_from_email",
  "new_password": "new_password"
}
```

---

## 2. Users

Prefix: `/api/v1/users`

| Method | Path | Required Role(s) | Description |
|--------|------|-------------------|-------------|
| GET | `/users` | super_admin, lab_manager | List users with pagination and filters |
| POST | `/users` | super_admin | Create a new user account |
| GET | `/users/{user_id}` | super_admin, lab_manager | Get user by ID |
| PUT | `/users/{user_id}` | super_admin | Update a user |
| DELETE | `/users/{user_id}` | super_admin | Soft-delete (deactivate) a user |
| POST | `/users/{user_id}/reset-password` | super_admin | Admin password reset |
| PUT | `/users/{user_id}/activate` | super_admin | Toggle user active/inactive |

### GET /users

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| page | int | 1 | Page number (>=1) |
| per_page | int | 20 | Items per page (1-100) |
| role | string | - | Filter by UserRole enum |
| is_active | bool | - | Filter by active status |
| search | string | - | Search by name/email |

### POST /users

**Request Body:**

```json
{
  "email": "newuser@example.com",
  "full_name": "Jane Doe",
  "role": "lab_technician",
  "password": "initial_password"
}
```

---

## 3. Participants

Prefix: `/api/v1/participants`

| Method | Path | Required Role(s) | Description |
|--------|------|-------------------|-------------|
| GET | `/participants` | All view roles | List participants with fuzzy search |
| POST | `/participants` | super_admin, lab_manager, data_entry, field_coordinator | Create participant |
| GET | `/participants/{id}` | All view roles | Get participant detail |
| PUT | `/participants/{id}` | super_admin, lab_manager, data_entry | Update participant |
| DELETE | `/participants/{id}` | super_admin, lab_manager | Soft-delete participant |
| GET | `/participants/{id}/consents` | All view roles | List consents |
| POST | `/participants/{id}/consents` | super_admin, lab_manager, data_entry, field_coordinator | Create consent |
| PUT | `/participants/consents/{consent_id}` | super_admin, lab_manager, data_entry | Update consent |

**View roles:** super_admin, lab_manager, lab_technician, data_entry, field_coordinator, collaborator, pi_researcher

### GET /participants

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| page | int | 1 | Page number |
| per_page | int | 20 | Items per page (1-100) |
| search | string | - | Fuzzy search (pg_trgm) on participant_code, name |
| collection_site_id | UUID | - | Filter by collection site |
| age_group | int | - | Filter by age group (1-5) |
| sex | string | - | Filter by sex (M/F) |
| wave | int | - | Filter by study wave |
| sort | string | created_at | Sort field |
| order | string | desc | Sort order (asc/desc) |

### POST /participants

**Request Body:**

```json
{
  "participant_code": "A1-001",
  "group_code": "A1",
  "participant_number": 1,
  "age_group": 2,
  "sex": "M",
  "collection_site_id": "uuid",
  "enrollment_date": "2025-01-01T00:00:00Z",
  "enrollment_source": "manual",
  "date_of_birth": "1990-05-15",
  "wave": 1
}
```

### GET /participants/{id} (Detail)

Returns participant with consents, sample counts by type, and collection site info.

---

## 4. Samples

Prefix: `/api/v1/samples`

| Method | Path | Required Role(s) | Description |
|--------|------|-------------------|-------------|
| GET | `/samples` | All roles | List samples with filters |
| POST | `/samples` | super_admin, lab_manager, lab_technician, field_coordinator | Register new sample |
| GET | `/samples/discard-requests` | super_admin, lab_manager | List discard requests |
| POST | `/samples/discard-requests/{id}/approve` | super_admin, lab_manager | Approve/reject discard |
| GET | `/samples/{id}` | All roles | Get sample detail |
| PUT | `/samples/{id}` | Write roles | Update sample notes/deviation |
| POST | `/samples/{id}/status` | Write roles | Change sample status |
| POST | `/samples/{id}/aliquot` | Write roles | Auto-generate aliquots |
| POST | `/samples/{id}/withdraw` | Write roles | Record volume withdrawal |
| GET | `/samples/{id}/history` | All roles | Get status history timeline |
| POST | `/samples/{id}/discard-request` | Write roles | Create discard request |

**Write roles:** super_admin, lab_manager, lab_technician, field_coordinator

### GET /samples

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| page | int | 1 | Page number |
| per_page | int | 20 | Items per page (1-100) |
| search | string | - | Fuzzy search on sample_code |
| participant_id | UUID | - | Filter by participant |
| sample_type | string | - | Filter by SampleType enum |
| sample_status | string | - | Filter by SampleStatus enum |
| wave | int | - | Filter by wave |
| sort | string | created_at | Sort field |
| order | string | desc | Sort order |

**SampleType values:** plasma, epigenetics, extra_blood, rbc_smear, cheek_swab, hair, urine, stool_kit

**SampleStatus values:** registered, collected, transported, received, processing, stored, reserved, in_analysis, pending_discard, depleted, discarded

### POST /samples/{id}/status

**Request Body:**

```json
{
  "new_status": "collected",
  "notes": "Collected at field site",
  "location_context": "Site A1"
}
```

Status transitions are validated server-side.

### POST /samples/{id}/withdraw

**Request Body:**

```json
{
  "volume_ul": 50.0,
  "reason": "Proteomics analysis"
}
```

### POST /samples/{id}/discard-request

**Request Body:**

```json
{
  "reason": "contamination",
  "reason_notes": "Hemolyzed sample"
}
```

**DiscardReason values:** contamination, depleted, consent_withdrawal, expired, other

### POST /samples/discard-requests/{id}/approve

**Request Body:**

```json
{
  "approved": true,
  "rejection_reason": null
}
```

---

## 5. Storage

Prefix: `/api/v1/storage`

### Freezers

| Method | Path | Required Role(s) | Description |
|--------|------|-------------------|-------------|
| GET | `/storage/freezers` | All roles | List freezers with utilization |
| POST | `/storage/freezers` | super_admin, lab_manager | Create freezer |
| GET | `/storage/freezers/{id}` | All roles | Get freezer detail |
| PUT | `/storage/freezers/{id}` | super_admin, lab_manager | Update freezer |
| DELETE | `/storage/freezers/{id}` | super_admin, lab_manager | Deactivate freezer |

**GET /storage/freezers Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| page | int | 1 | Page number |
| per_page | int | 20 | Items per page (1-100) |
| freezer_type | string | - | Filter by FreezerType |
| is_active | bool | - | Filter by active status |

**FreezerType values:** minus_150, minus_80, plus_4, room_temp

### Racks

| Method | Path | Required Role(s) | Description |
|--------|------|-------------------|-------------|
| GET | `/storage/freezers/{id}/racks` | All roles | List racks for freezer |
| POST | `/storage/freezers/{id}/racks` | Write roles | Create single rack |
| POST | `/storage/freezers/{id}/racks/batch` | Write roles | Batch-create racks |

### Boxes

| Method | Path | Required Role(s) | Description |
|--------|------|-------------------|-------------|
| GET | `/storage/boxes` | All roles | List boxes with occupancy |
| POST | `/storage/boxes` | Write roles | Create box (auto-creates grid) |
| GET | `/storage/boxes/{id}` | All roles | Get box detail with positions |
| PUT | `/storage/boxes/{id}` | Write roles | Update box |
| POST | `/storage/boxes/{id}/consolidate` | super_admin, lab_manager | Consolidate samples between boxes |

**GET /storage/boxes Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| page | int | 1 | Page number |
| per_page | int | 20 | Items per page (1-100) |
| rack_id | UUID | - | Filter by rack |
| freezer_id | UUID | - | Filter by freezer |
| group_code | string | - | Filter by group code |
| has_space | bool | - | Only boxes with empty positions |

### Positions

| Method | Path | Required Role(s) | Description |
|--------|------|-------------------|-------------|
| POST | `/storage/positions/{id}/assign` | Write roles | Assign sample to position |
| POST | `/storage/positions/{id}/unassign` | Write roles | Remove sample from position |
| POST | `/storage/auto-assign` | Write roles | Auto-assign sample to best position |
| POST | `/storage/bulk-assign` | Write roles | Batch-assign multiple samples |

### Temperature Events

| Method | Path | Required Role(s) | Description |
|--------|------|-------------------|-------------|
| GET | `/storage/freezers/{id}/temperature` | All roles | List temperature events |
| POST | `/storage/freezers/{id}/temperature` | Write roles | Record temperature event |
| PUT | `/storage/temperature-events/{id}/resolve` | super_admin, lab_manager | Resolve temperature event |

### Search

| Method | Path | Required Role(s) | Description |
|--------|------|-------------------|-------------|
| GET | `/storage/search?sample_code=...` | All roles | Search sample storage location |

---

## 6. Field Events

Prefix: `/api/v1/field-events`

| Method | Path | Required Role(s) | Description |
|--------|------|-------------------|-------------|
| GET | `/field-events` | Read roles | List field events |
| POST | `/field-events` | super_admin, lab_manager, field_coordinator | Create event |
| GET | `/field-events/{id}` | Read roles | Get event detail with roster |
| PUT | `/field-events/{id}` | Write roles | Update event (with status validation) |
| POST | `/field-events/{id}/participants` | Write roles | Bulk-add participants |
| POST | `/field-events/{id}/check-in` | Write roles | Record participant check-in |
| POST | `/field-events/{id}/bulk-update` | Write roles | Bulk digitize paper forms |

**Read roles:** super_admin, lab_manager, field_coordinator, data_entry, pi_researcher
**Write roles:** super_admin, lab_manager, field_coordinator

### GET /field-events

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| page | int | 1 | Page number |
| per_page | int | 20 | Items per page (1-100) |
| event_status | string | - | Filter by FieldEventStatus |
| collection_site_id | UUID | - | Filter by site |
| date_from | date | - | Start date filter |
| date_to | date | - | End date filter |
| sort | string | event_date | Sort field |
| order | string | desc | Sort order |

**FieldEventStatus values:** planned, in_progress, completed, cancelled

---

## 7. Instruments

Prefix: `/api/v1/instruments`

### Instruments

| Method | Path | Required Role(s) | Description |
|--------|------|-------------------|-------------|
| GET | `/instruments` | All roles | List instruments |
| POST | `/instruments` | super_admin, lab_manager | Create instrument |
| GET | `/instruments/{id}` | All roles | Get instrument detail |
| PUT | `/instruments/{id}` | super_admin, lab_manager | Update instrument |

### Instrument Runs

| Method | Path | Required Role(s) | Description |
|--------|------|-------------------|-------------|
| GET | `/instruments/runs` | All roles | List runs |
| POST | `/instruments/runs` | Write roles | Create run |
| GET | `/instruments/runs/{id}` | All roles | Get run detail |
| PUT | `/instruments/runs/{id}` | Write roles | Update run |
| POST | `/instruments/runs/{id}/start` | Write roles | Start run |
| POST | `/instruments/runs/{id}/complete` | Write roles | Complete run |
| POST | `/instruments/runs/{id}/results` | Write roles | Upload run results |

**GET /instruments/runs Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| page | int | 1 | Page number |
| per_page | int | 20 | Items per page (1-100) |
| instrument_id | UUID | - | Filter by instrument |
| status | string | - | Filter by RunStatus |
| run_type | string | - | Filter by RunType |
| search | string | - | Search run name |
| sort | string | created_at | Sort field |
| order | string | desc | Sort order |

**RunStatus values:** planned, in_progress, completed, failed
**RunType values:** proteomics, metabolomics, plate_prep, other

### Plates

| Method | Path | Required Role(s) | Description |
|--------|------|-------------------|-------------|
| GET | `/instruments/plates` | All roles | List plates |
| POST | `/instruments/plates` | Write roles | Create plate |
| GET | `/instruments/plates/{id}` | All roles | Get plate detail |
| POST | `/instruments/plates/{id}/assign-wells` | Write roles | Assign wells |
| POST | `/instruments/plates/{id}/randomize` | Write roles | Stratified randomization |
| GET | `/instruments/plates/{id}/grid` | All roles | Get plate grid layout |
| GET | `/instruments/plates/{id}/tecan-worklist` | Write roles | Generate TECAN worklist (JSON/CSV) |

### QC/Plate Templates

| Method | Path | Required Role(s) | Description |
|--------|------|-------------------|-------------|
| GET | `/instruments/plate-templates` | All roles | List QC templates |
| POST | `/instruments/plate-templates` | Write roles | Create QC template |

### Omics Results

| Method | Path | Required Role(s) | Description |
|--------|------|-------------------|-------------|
| GET | `/instruments/omics-results` | All roles | Query omics results |
| GET | `/instruments/omics-result-sets` | All roles | List result sets |
| GET | `/instruments/omics-result-sets/{id}` | All roles | Get result set detail |

**GET /instruments/omics-results Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| page | int | 1 | Page number |
| per_page | int | 100 | Items per page (1-1000) |
| result_set_id | UUID | - | Filter by result set |
| sample_id | UUID | - | Filter by sample |
| participant_id | UUID | - | Filter by participant |
| feature_id | string | - | Filter by feature ID |

---

## 8. ICC

Prefix: `/api/v1/icc`

| Method | Path | Required Role(s) | Description |
|--------|------|-------------------|-------------|
| GET | `/icc` | All roles | List ICC processing records |
| POST | `/icc` | Write roles | Create ICC record |
| GET | `/icc/{id}` | All roles | Get ICC detail |
| PUT | `/icc/{id}` | Write roles | Update ICC record |
| POST | `/icc/{id}/advance` | Write roles | Advance to next workflow step |

**IccStatus workflow:** received -> fixation -> permeabilization -> blocking -> primary_antibody -> secondary_antibody -> dapi_staining -> mounted -> imaging -> analysis_complete

### GET /icc

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| page | int | 1 | Page number |
| per_page | int | 20 | Items per page (1-100) |
| sample_id | UUID | - | Filter by sample |
| participant_id | UUID | - | Filter by participant |
| status | string | - | Filter by IccStatus |
| sort | string | created_at | Sort field |
| order | string | desc | Sort order |

---

## 9. Dashboard

Prefix: `/api/v1/dashboard`

All endpoints require any authenticated role.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/dashboard/overview` | Aggregate summary of all metrics |
| GET | `/dashboard/summary` | Alias for /overview (backward compat) |
| GET | `/dashboard/enrollment` | Enrollment statistics |
| GET | `/dashboard/inventory` | Sample inventory stats |
| GET | `/dashboard/field-ops` | Field operations stats |
| GET | `/dashboard/instruments` | Instrument utilization stats |
| GET | `/dashboard/quality` | QC pass/fail rates |

No query parameters. Dashboard data is pre-computed by Celery beat (every 15 minutes).

---

## 10. Reports

Prefix: `/api/v1/reports`

| Method | Path | Required Role(s) | Description |
|--------|------|-------------------|-------------|
| POST | `/reports/generate` | super_admin, lab_manager, pi_researcher | Generate on-demand PDF report |
| GET | `/reports/types` | All roles | List available report types |
| GET | `/reports/scheduled` | super_admin, lab_manager | List scheduled reports |
| POST | `/reports/scheduled` | super_admin, lab_manager | Create scheduled report |
| GET | `/reports/scheduled/{id}` | super_admin, lab_manager | Get scheduled report |
| PUT | `/reports/scheduled/{id}` | super_admin, lab_manager | Update scheduled report |
| DELETE | `/reports/scheduled/{id}` | super_admin, lab_manager | Delete scheduled report |
| GET | `/reports/scheduled/{id}/preview` | super_admin, lab_manager | Preview scheduled report as PDF |

### POST /reports/generate

Rate limit: 5/min per IP. Returns inline PDF.

**Request Body:**

```json
{
  "report_type": "enrollment_summary",
  "filters": {}
}
```

**ReportType values:** enrollment_summary, inventory_summary, quality_summary, compliance

### POST /reports/scheduled

**Request Body:**

```json
{
  "report_name": "Weekly Enrollment",
  "report_type": "enrollment_summary",
  "schedule_cron": "0 8 * * 1",
  "recipients": { "emails": ["manager@lab.org"] },
  "filters": {}
}
```

---

## 11. Query Builder

Prefix: `/api/v1/query-builder`

| Method | Path | Required Role(s) | Description |
|--------|------|-------------------|-------------|
| GET | `/query-builder/entities` | All roles | List queryable entities and fields |
| POST | `/query-builder/execute` | super_admin, lab_manager, pi_researcher | Execute structured query |
| POST | `/query-builder/export` | super_admin, lab_manager, pi_researcher | Export query results as CSV |

Rate limit: 20/min per IP.

### POST /query-builder/execute

**Request Body:**

```json
{
  "entity": "participants",
  "columns": ["participant_code", "age_group", "sex"],
  "filters": [
    { "field": "age_group", "operator": "eq", "value": 2 }
  ],
  "sort_by": "created_at",
  "sort_order": "desc",
  "page": 1,
  "per_page": 50
}
```

---

## 12. Files

Prefix: `/api/v1/files`

### Watch Directories

| Method | Path | Required Role(s) | Description |
|--------|------|-------------------|-------------|
| GET | `/files/watch-dirs` | super_admin, lab_manager | List watch directories |
| POST | `/files/watch-dirs` | super_admin, lab_manager | Create watch directory |
| PATCH | `/files/watch-dirs/{id}` | super_admin, lab_manager | Update watch directory |
| POST | `/files/watch-dirs/{id}/scan` | super_admin, lab_manager | Trigger manual scan |

### Files

| Method | Path | Required Role(s) | Description |
|--------|------|-------------------|-------------|
| GET | `/files` | All roles | List managed files |
| GET | `/files/entity/{type}/{id}` | All roles | Get files for entity |
| POST | `/files/verify/{id}` | super_admin, lab_manager | Verify file integrity (SHA-256) |
| GET | `/files/{id}` | All roles | Get file metadata |
| DELETE | `/files/{id}` | super_admin, lab_manager | Delete file record |
| POST | `/files/{id}/associate` | Write roles | Associate file with entity |

### GET /files

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| page | int | 1 | Page number |
| per_page | int | 20 | Items per page (1-100) |
| search | string | - | Search file name |
| category | string | - | Filter by FileCategory |
| instrument_id | UUID | - | Filter by instrument |
| associated_entity_type | string | - | Filter by entity type |
| associated_entity_id | UUID | - | Filter by entity ID |
| sort | string | discovered_at | Sort field |
| order | string | desc | Sort order |

**FileCategory values:** instrument_output, partner_data, icc_image, report, omics_data, other

---

## 13. Sync

Prefix: `/api/v1/sync`

Offline/PWA sync endpoints for field operations.

| Method | Path | Required Role(s) | Description |
|--------|------|-------------------|-------------|
| POST | `/sync/push` | Sync roles | Push offline mutations to server |
| POST | `/sync/pull` | Sync roles | Pull latest data since timestamp |
| GET | `/sync/status` | Sync roles | Get sync status for current user |

**Sync roles:** super_admin, lab_manager, lab_technician, field_coordinator, data_entry

### POST /sync/push

Processes mutations in order. Conflicts detected via timestamp comparison (server wins).

**Request Body:**

```json
{
  "device_id": "device-uuid",
  "mutations": [
    {
      "entity_type": "field_event_participant",
      "entity_id": "uuid",
      "action": "update",
      "data": { ... },
      "timestamp": "2025-01-01T12:00:00Z"
    }
  ]
}
```

### POST /sync/pull

Returns participants and samples updated since the provided timestamp. Limited to 500 participants and 1000 samples per pull.

**Request Body:**

```json
{
  "since": "2025-01-01T00:00:00Z",
  "entity_types": ["participants", "samples"]
}
```

---

## 14. Partner

Prefix: `/api/v1/partner`

### ODK Form Configs

| Method | Path | Required Role(s) | Description |
|--------|------|-------------------|-------------|
| GET | `/partner/odk/form-configs` | All roles | List ODK form configs |
| POST | `/partner/odk/form-configs` | super_admin, lab_manager | Create form config |
| PUT | `/partner/odk/form-configs/{id}` | super_admin, lab_manager | Update form config |

### ODK Sync

| Method | Path | Required Role(s) | Description |
|--------|------|-------------------|-------------|
| POST | `/partner/odk/sync` | super_admin, lab_manager | Trigger ODK sync |
| GET | `/partner/odk/sync-logs` | All roles | List sync logs |
| GET | `/partner/odk/submissions` | All roles | List ODK submissions |

### Partner Lab Imports

| Method | Path | Required Role(s) | Description |
|--------|------|-------------------|-------------|
| POST | `/partner/imports/upload` | super_admin, lab_manager | Upload partner CSV (max 10 MB) |
| GET | `/partner/imports/{id}/preview` | super_admin, lab_manager | Preview import with validation |
| POST | `/partner/imports/{id}/configure` | super_admin, lab_manager | Set field/test mapping |
| POST | `/partner/imports/{id}/execute` | super_admin, lab_manager | Execute import |
| GET | `/partner/imports` | All roles | List imports |
| GET | `/partner/imports/{id}` | All roles | Get import detail with results |
| GET | `/partner/partner-results` | All roles | Query partner lab results |

**PartnerName values:** healthians, 1mg, lalpath, decodeage

### Canonical Tests

| Method | Path | Required Role(s) | Description |
|--------|------|-------------------|-------------|
| GET | `/partner/canonical-tests` | All roles | List canonical tests |
| POST | `/partner/canonical-tests` | super_admin, lab_manager | Create canonical test |
| PUT | `/partner/canonical-tests/{id}` | super_admin, lab_manager | Update canonical test |
| GET | `/partner/canonical-tests/{id}/aliases` | All roles | List aliases |
| POST | `/partner/canonical-tests/{id}/aliases` | super_admin, lab_manager | Add alias |
| DELETE | `/partner/canonical-tests/aliases/{id}` | super_admin, lab_manager | Delete alias |

### Stool Kits

| Method | Path | Required Role(s) | Description |
|--------|------|-------------------|-------------|
| POST | `/partner/stool-kits` | super_admin, lab_manager, field_coordinator | Issue stool kit |
| PUT | `/partner/stool-kits/{id}` | super_admin, lab_manager, field_coordinator | Update kit status |
| GET | `/partner/stool-kits` | All roles | List stool kits |

**StoolKitStatus values:** issued, pickup_scheduled, collected_by_decodeage, processing, results_received

---

## 15. Notifications

Prefix: `/api/v1/notifications`

All endpoints require any authenticated user.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/notifications` | List notifications for current user |
| GET | `/notifications/unread-count` | Get unread count (bell badge) |
| PUT | `/notifications/{id}/read` | Mark single notification as read |
| PUT | `/notifications/mark-all-read` | Mark all notifications as read |

### GET /notifications

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| page | int | 1 | Page number |
| per_page | int | 20 | Items per page (1-100) |
| notification_type | string | - | Filter by NotificationType |
| severity | string | - | Filter by NotificationSeverity |
| is_read | bool | - | Filter read/unread |

**NotificationType values:** odk_sync_failure, freezer_capacity_warning, freezer_temp_event, consent_withdrawal, import_error, backup_stale, discard_request, processing_timer_exceeded, system_alert, file_discovered, file_integrity_failed

**NotificationSeverity values:** info, warning, critical

---

## 16. Collection Sites

Prefix: `/api/v1/collection-sites`

| Method | Path | Required Role(s) | Description |
|--------|------|-------------------|-------------|
| GET | `/collection-sites` | Any authenticated | List all collection sites |
| POST | `/collection-sites` | super_admin | Create collection site |
| GET | `/collection-sites/{id}` | Any authenticated | Get site by ID |
| PUT | `/collection-sites/{id}` | super_admin, lab_manager | Update site |

### GET /collection-sites

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| is_active | bool | - | Filter by active status |

---

## 17. Transports

Prefix: `/api/v1/transports`

| Method | Path | Required Role(s) | Description |
|--------|------|-------------------|-------------|
| POST | `/transports` | super_admin, lab_manager, lab_technician, field_coordinator | Record transport |
| GET | `/transports` | super_admin, lab_manager, lab_technician, field_coordinator | List transports |

### GET /transports

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| page | int | 1 | Page number |
| per_page | int | 20 | Items per page (1-100) |

---

## 18. Labels

Prefix: `/api/v1/labels`

| Method | Path | Required Role(s) | Description |
|--------|------|-------------------|-------------|
| POST | `/labels/generate-zip` | Label roles | Generate all 5 label docs as ZIP |
| POST | `/labels/generate-single` | Label roles | Generate single label group (.docx) |
| GET | `/labels/groups` | Label roles | List available label groups |

**Label roles:** super_admin, lab_manager, lab_technician, field_coordinator, data_entry

### POST /labels/generate-zip

Returns ZIP containing: labels_cryovial.docx, labels_epigenetics.docx, labels_samples.docx, labels_edta.docx, labels_sst_fl_blood.docx

**Request Body:**

```json
{
  "participant_codes": ["A1-001", "A1-002", "A1-003"],
  "date_str": "2025-01-15"
}
```

### POST /labels/generate-single

**Request Body:**

```json
{
  "participant_codes": ["A1-001", "A1-002"],
  "group": "cryovial"
}
```

**Groups:** cryovial, epigenetics, samples, edta, sst_fl_blood

---

## 19. QR Codes

Prefix: `/api/v1/qr`

| Method | Path | Required Role(s) | Description |
|--------|------|-------------------|-------------|
| GET | `/qr/sample/{sample_id}` | All roles | Generate QR code PNG for sample |
| POST | `/qr/batch` | Write roles | Generate QR codes as ZIP |
| GET | `/qr/lookup/{code}` | All roles | Look up sample info by code (scan) |

### GET /qr/lookup/{code}

Returns sample info including status, type, participant, collection site, wave, and full storage location (freezer/rack/box/position).

---

## 20. Settings

Prefix: `/api/v1/settings`

All endpoints require `super_admin` role.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/settings` | List all settings grouped by category |
| GET | `/settings/{category}` | Get settings for category |
| PUT | `/settings/{category}/{key}` | Update a setting value |

### PUT /settings/{category}/{key}

**Request Body:**

```json
{
  "value": "new_value"
}
```

Validates type (string, integer, boolean, json) and creates an audit log entry.

---

## Health Check

| Method | Path | Auth Required | Description |
|--------|------|---------------|-------------|
| GET | `/api/health` | No | Deep health check (DB + Redis + Celery broker) |

**Response:**

```json
{
  "version": "0.1.0",
  "status": "healthy",
  "database": { "status": "ok", "latency_ms": 2.5 },
  "redis": { "status": "ok", "latency_ms": 1.1 },
  "celery_broker": "ok"
}
```

Returns HTTP 200 if healthy, HTTP 503 if degraded.
