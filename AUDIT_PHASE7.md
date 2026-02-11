# Phase 7 Devil's Advocate Audit: Managed File Store

**Auditor:** Claude (automated)
**Date:** 2026-02-12
**Scope:** `backend/app/models/file_store.py`, `backend/app/schemas/file_store.py`,
`backend/app/services/file_store.py`, `backend/app/api/v1/files.py`,
`frontend/src/api/files.ts`, `frontend/src/features/files/FileManagerPage.tsx`

---

## Summary

The managed file store is **structurally solid** with good fundamentals: UUID-based
storage names prevent directory-level filename collisions, SHA-256 checksums are
computed, file size limits exist, and soft-delete with audit logging is in place.
However, the audit identifies **3 critical** and **5 moderate** issues, primarily
around path traversal in the download path, missing content-type validation, lack
of symlink protection in watch directory scanning, and IDOR exposure in the file
listing API.

---

## Critical Issues

### C-01: Download endpoint trusts database `storage_path` without validation (Path Traversal)

**File:** `backend/app/api/v1/files.py:209-217`

**Problem:** The download endpoint reads `managed_file.storage_path` from the database
and passes it directly to `FileResponse` with no verification that the resolved path
is under the expected `FILE_STORE_PATH` root. If an attacker can manipulate a
`storage_path` record (via SQL injection elsewhere, compromised DB, or a bug in watch
directory ingestion), they can read arbitrary files from the server filesystem.

```python
file_path = Path(managed_file.storage_path)
if not file_path.is_file():
    raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found on disk.")
return FileResponse(path=str(file_path), ...)  # No containment check
```

**Fix:**
```python
file_path = Path(managed_file.storage_path).resolve()
store_root = Path(settings.FILE_STORE_PATH).resolve()
if not file_path.is_relative_to(store_root):
    raise HTTPException(status.HTTP_403_FORBIDDEN, "Access denied.")
if not file_path.is_file():
    raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found on disk.")
```

**Risk:** High -- arbitrary file read from server filesystem.

---

### C-02: No content-type or file extension validation on upload

**File:** `backend/app/services/file_store.py:52-110`, `backend/app/api/v1/files.py:104-147`

**Problem:** The upload endpoint accepts any file regardless of content type or
extension. There is no allowlist or denylist. An attacker with `WRITE_ROLES` (which
includes `LAB_TECHNICIAN`) can upload:

1. **Executable files** (`.exe`, `.sh`, `.bat`, `.py`) that could be served back and
   executed if the storage directory is ever exposed via a web server misconfiguration.
2. **Polyglot files** (e.g., a valid JPEG that is also valid HTML/JS) that could enable
   stored XSS if the `content_type` is trusted for inline rendering.
3. **`.html`/`.svg` files** with embedded JavaScript, which `FileResponse` will serve
   with the attacker-controlled `content_type`.

The `content_type` is taken directly from the client request header (`file.content_type`)
and stored in the database without any server-side verification.

**Fix:**
1. Define an `ALLOWED_EXTENSIONS` set (e.g., `.csv`, `.xlsx`, `.pdf`, `.png`, `.jpg`,
   `.tiff`, `.txt`, `.json`, `.xml`, `.fastq`, `.fcs`).
2. Define an `ALLOWED_CONTENT_TYPES` set mapping to those extensions.
3. Validate the extension from the sanitized filename against the allowlist.
4. Optionally use `python-magic` to sniff the actual file content and compare against
   the claimed content type.
5. On download, always set `Content-Disposition: attachment` unless the content type
   is in a safe inline-renderable set (images only).

**Risk:** High -- stored XSS via crafted HTML/SVG uploads; potential for malware storage.

---

### C-03: Watch directory scan follows symlinks (symlink attack vector)

**File:** `backend/app/services/file_store.py:278-284`

**Problem:** The `scan_directory` method iterates over `dir_path.iterdir()` and checks
`entry.is_file()`, but `Path.is_file()` follows symlinks by default. If an attacker
can place a symlink inside a watch directory (e.g., a shared network mount, NAS, or
a directory writable by lab instruments), the symlink could point to:

- `/etc/shadow`, `/etc/passwd`, or other sensitive system files
- Files outside the intended data directory
- An infinitely recursive symlink causing a hang

The file contents are then read, checksummed, and stored in the managed file store,
effectively exfiltrating arbitrary server files into the LIMS database and storage.

```python
for entry in sorted(dir_path.iterdir()):
    if not entry.is_file():  # follows symlinks!
        continue
    file_data = entry.read_bytes()  # reads target of symlink
```

**Fix:**
```python
for entry in sorted(dir_path.iterdir()):
    if entry.is_symlink():
        logger.warning("Skipping symlink: %s", entry.name)
        continue
    if not entry.is_file():
        continue
```

Additionally, resolve the `dir_path` itself and verify it is not a symlink:
```python
dir_path = Path(watch_dir.directory_path).resolve()
if Path(watch_dir.directory_path) != dir_path:
    raise ValueError("Watch directory path contains symlinks.")
```

**Risk:** High -- arbitrary file read from the host via symlink planted in watch directory.

---

## Moderate Issues

### M-01: All authenticated users can list and download ALL files (IDOR / Missing tenant isolation)

**File:** `backend/app/api/v1/files.py:152-177` (list), `backend/app/api/v1/files.py:182-217` (get/download)

**Problem:** The `list_files`, `get_file`, and `download_file` endpoints are available
to `ALL_ROLES`, which includes `COLLABORATOR` and `DATA_ENTRY`. There is no filtering
by `uploaded_by` or associated entity ownership. Any authenticated user can:

1. List all files in the system (including files uploaded by other users, other labs,
   or containing sensitive instrument data).
2. Download any file by UUID (if they can guess or enumerate IDs, which is mitigated
   by UUIDs but not by design).
3. View the `storage_path` field in the response, leaking server filesystem structure.

**Fix:**
- For non-admin roles, filter `list_files` by `uploaded_by == current_user.id` or by
  associated entities the user has access to.
- Alternatively, implement a file visibility model (public, lab-only, owner-only).
- Remove `storage_path` from the `ManagedFileRead` schema -- there is no reason to
  expose internal filesystem paths to API consumers.

**Risk:** Medium -- information disclosure, potential data exfiltration by low-privilege users.

---

### M-02: `storage_path` exposed in API response schema

**File:** `backend/app/schemas/file_store.py:25`

**Problem:** The `ManagedFileRead` schema includes `storage_path: str`, which exposes
the full server-side filesystem path (e.g., `/data/file_store/instrument_output/abc123.csv`)
to every API consumer. This leaks:

- The server's directory structure
- The `FILE_STORE_PATH` configuration value
- The category-based subdirectory naming scheme

This information aids an attacker in crafting path traversal or local file inclusion
attacks.

**Fix:** Remove `storage_path` from `ManagedFileRead`. If admins need it, create a
separate `ManagedFileAdminRead` schema.

---

### M-03: Watch directory path not validated or sandboxed

**File:** `backend/app/services/file_store.py:217-229`, `backend/app/api/v1/files.py:70-81`

**Problem:** The `create_watch_dir` endpoint accepts any `directory_path` string from
the admin user with no validation beyond Pydantic's `min_length=1, max_length=1000`.
An admin could register:

- `/etc/` or `/root/` as a watch directory
- `../../sensitive/data` (relative path)
- A path containing null bytes (though Python 3.x raises on null bytes in paths)

While this is admin-only, defense-in-depth requires:
1. Verifying the path is absolute.
2. Verifying it is under an allowed root (e.g., `NAS_MOUNT_PATH` or a configurable
   `WATCH_DIR_ALLOWED_ROOTS` list).
3. Resolving the path and verifying no symlinks in the chain.

**Fix:**
```python
async def create_watch_dir(self, data: WatchDirectoryCreate) -> WatchDirectory:
    dir_path = Path(data.directory_path).resolve()
    allowed_roots = [Path(settings.NAS_MOUNT_PATH).resolve()]
    if not any(dir_path.is_relative_to(root) for root in allowed_roots):
        raise ValueError(f"Watch directory must be under an allowed root.")
    ...
```

---

### M-04: No disk space quota or total storage limit enforcement

**File:** `backend/app/services/file_store.py:60-63`, `backend/app/api/v1/files.py:118-122`

**Problem:** While individual file size is capped at `FILE_STORE_MAX_SIZE_MB` (100 MB),
there is no:

1. **Total storage quota** per user, per category, or system-wide.
2. **Rate limiting** on upload frequency.
3. **Disk space check** before writing.

A malicious or careless user with `WRITE_ROLES` can repeatedly upload 100 MB files
until the disk is full, causing:
- Denial of service for the entire application
- Database failures if PostgreSQL shares the same volume
- Potential data corruption

**Fix:**
1. Add a configurable `FILE_STORE_MAX_TOTAL_GB` setting.
2. Before upload, query `SELECT SUM(file_size) FROM managed_file WHERE is_deleted = false`
   and reject if the total would exceed the quota.
3. Optionally add per-user upload rate limiting via Redis.
4. Check disk free space before writing: `shutil.disk_usage(settings.FILE_STORE_PATH)`.

---

### M-05: Soft-deleted files remain on disk indefinitely

**File:** `backend/app/services/file_store.py:155-173`

**Problem:** The `delete_file` method sets `is_deleted = True` but does not remove or
schedule removal of the actual file from disk. Over time, this causes:

1. **Disk space waste** from files that are logically deleted but physically present.
2. **Compliance risk** if regulatory requirements mandate actual data deletion
   (e.g., GDPR right to erasure, though this is a lab system).
3. **Recovery ambiguity** -- if the file is "restored" from soft-delete, it works
   silently, but there is no explicit restore endpoint either.

**Fix:**
1. Add a Celery periodic task that purges files from disk where `is_deleted = True`
   and `deleted_at < now() - retention_period`.
2. Add a configurable `FILE_STORE_RETENTION_DAYS` setting.
3. Document the retention policy.

---

## Minor Issues

### L-01: `mimetypes` import inside loop body

**File:** `backend/app/services/file_store.py:294-295`

**Problem:** The `import mimetypes` statement is inside the `for` loop in
`scan_directory`. While Python caches imports, this is a code smell and should be
moved to the top of the file.

---

### L-02: Watch directory scan loads all existing checksums into memory

**File:** `backend/app/services/file_store.py:268-273`

**Problem:** The scan loads ALL non-deleted file checksums into a Python set:
```python
existing_checksums = {row[0] for row in existing_checksums_result.all()}
```

For a system with millions of files, this set could consume significant memory. Consider
using a database `EXISTS` check per file instead, or limiting the query to checksums
within the same category.

---

### L-03: Frontend image preview bypasses authentication

**File:** `frontend/src/features/files/FileManagerPage.tsx:582-583`

**Problem:** The file detail dialog renders an `<img>` tag with `src` pointing to the
download URL:
```tsx
<img src={`/api/v1/files/${detailFile.id}/download`} />
```

The `<img>` tag makes a GET request without the `Authorization: Bearer` header, so
the image will fail to load (the backend requires auth). This is a functionality bug
rather than a security bug, but it demonstrates inconsistency -- the `useFileDownload`
hook correctly uses `fetch` with auth headers, but the inline preview does not.

**Fix:** Use a blob URL approach similar to the download hook, or create a dedicated
thumbnail endpoint that uses cookie-based auth for `<img>` compatibility.

---

### L-04: No file deduplication strategy

**File:** `backend/app/services/file_store.py:66-80`

**Problem:** The upload flow computes SHA-256 but does not check for existing files
with the same checksum. Two uploads of the same file create two separate disk copies.
The watch directory scanner correctly deduplicates, but the upload endpoint does not.

Consider either:
1. Content-addressable storage (store once, reference by checksum).
2. Warning the user that an identical file already exists.

---

### L-05: `per_page` can be set to 0 causing division by zero

**File:** `backend/app/api/v1/files.py:43-49`

**Problem:** The `_paginate_meta` function has a guard `if per_page` to avoid division
by zero, but the FastAPI query parameter has `ge=1` validation, so this is actually
safe. However, the `total_pages` calculation returns `0` when `total` is `0` and
`per_page` is valid, which is correct. No action needed -- this is informational.

---

## Positive Findings

1. **UUID-based storage filenames** (`{uuid4}{ext}`) prevent collision and make
   enumeration infeasible.
2. **`_sanitize_filename`** strips directory separators via `os.path.basename`, null
   bytes, and leading dots. This is effective against basic path traversal on upload.
3. **SHA-256 checksum** computation and storage enables integrity verification.
4. **Audit logging** on upload, delete, and associate operations provides traceability.
5. **Role-based access control** properly restricts write/admin operations.
6. **ILIKE escaping** in search prevents SQL wildcard injection.
7. **Sort column whitelist** (`FILE_ALLOWED_SORTS`) prevents SQL injection via sort
   parameter.
8. **Soft delete** preserves data for recovery and audit trail.
9. **File size validation** at both API layer and service layer (defense in depth).
10. **Watch directory checksum deduplication** prevents re-ingesting the same file.

---

## Fixes Priority

| ID   | Severity | Effort | Description                                    |
|------|----------|--------|------------------------------------------------|
| C-01 | CRITICAL | Low    | Add path containment check on download         |
| C-02 | CRITICAL | Medium | Add content-type/extension allowlist            |
| C-03 | CRITICAL | Low    | Skip symlinks in watch directory scan           |
| M-01 | MODERATE | Medium | Add ownership filtering for non-admin roles     |
| M-02 | MODERATE | Low    | Remove `storage_path` from public schema        |
| M-03 | MODERATE | Low    | Validate watch directory paths against root      |
| M-04 | MODERATE | Medium | Add total storage quota enforcement             |
| M-05 | MODERATE | Low    | Add periodic disk cleanup for soft-deleted files |
| L-01 | LOW      | Low    | Move import to top of file                      |
| L-02 | LOW      | Low    | Optimize checksum dedup query                   |
| L-03 | LOW      | Low    | Fix image preview auth                          |
| L-04 | LOW      | Low    | Warn on duplicate checksum upload               |
