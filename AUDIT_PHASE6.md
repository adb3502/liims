# Phase 6 Devil's Advocate Audit: PWA Offline Support & Sync

**Auditor:** Claude Opus 4.6 (Devil's Advocate)
**Date:** 2026-02-12
**Scope:** Offline/PWA service worker, IndexedDB store, sync engine, sync API

---

## Executive Summary

Phase 6 implements a capable offline-first PWA with service worker caching, IndexedDB mutation queuing, and a batched sync push/pull protocol. The architecture is sound overall, but I identified **5 critical issues** and **7 moderate issues** that must be addressed before production deployment. The most dangerous flaws involve a lack of server-side transaction boundaries around batch mutations (partial-apply corruption), an authorization bypass in the sync pull endpoint, the service worker caching authenticated API responses (data leakage on shared devices), and a missing `sample_code` generation in the offline sample registration path.

---

## Critical Issues

### C-01: No Transaction Boundary Around Batch Mutations (Data Corruption Risk)

**File:** `backend/app/services/sync.py:62-140`

The `process_push()` method iterates through mutations, applying each with individual DB operations (`_apply_mutation`). The only `flush()` call is in `_apply_sample_register` (line 273). The final `commit()` happens implicitly in `get_db()` after the route handler returns. **However**, if a mutation halfway through the batch raises an exception that is caught by the `except Exception` handler on line 106, the earlier mutations are already in the session dirty state and will be committed when the request completes.

This means: if mutations 1-5 succeed, mutation 6 throws an exception (caught), and mutations 7-10 succeed, the response reports mutation 6 as an error, but mutations 1-5 and 7-10 are **all committed**. The client receives an error for mutation 6 and may retry it later, but the partial application has already happened. With interdependent mutations (e.g., `sample_register` followed by `sample_status_update` on the same sample), this creates inconsistent state.

**Recommendation:** Wrap the entire batch in a savepoint, or use per-mutation savepoints with rollback on error:
```python
async with self.db.begin_nested():  # savepoint
    result = await self._apply_mutation(...)
```

### C-02: Pull Endpoint Returns ALL Participants/Samples Without Tenant or Site Scoping

**File:** `backend/app/services/sync.py:358-420`

The `get_pull_data()` method accepts `user_id` as a parameter but **never uses it for filtering**. It returns up to 500 participants and 1000 samples from the entire database, regardless of which collection site or study the user belongs to. In a multi-site deployment, a field coordinator at site A would receive participant data for sites B, C, and D.

This is a significant data exposure. The `user_id` parameter is accepted but completely ignored in the query construction.

**Recommendation:** Filter participants and samples by the user's assigned `collection_site_id`, or add explicit site-scoping logic:
```python
# Get user's collection site(s)
user_sites = await self._get_user_sites(user_id)
query = query.where(Participant.collection_site_id.in_(user_sites))
```

### C-03: Offline Sample Registration Skips `sample_code` Auto-Generation

**File:** `backend/app/services/sync.py:261-272`

The `_apply_sample_register()` method creates a `Sample` object but does not generate a `sample_code`. The `Sample` model has `sample_code` as `unique=True, nullable=False` (see `backend/app/models/sample.py:32-34`). This means:

1. If the database has a NOT NULL constraint, the INSERT will fail with an IntegrityError.
2. If it somehow succeeds, the sample has no code and cannot be identified in the lab workflow.
3. The existing sample creation service likely has a `sample_code` generation routine that this offline path bypasses entirely.

**Recommendation:** Call the same sample code generator used by the normal `SampleService.create()` path, or generate a temporary code with a known prefix (e.g., `OFF-{uuid[:8]}`) that can be reconciled later.

### C-04: Service Worker Caches Authenticated API Responses (Data Leakage)

**File:** `frontend/public/sw.js:28-34, 170-204`

The `CACHEABLE_API_PATHS` includes `/api/v1/participants` and `/api/v1/samples`. The `networkFirstWithCache()` function caches these responses in the Cache API, which persists across sessions. On a shared device (common in field settings where tablets are shared between coordinators):

1. User A logs in, requests participant list. Response is cached in `liims-api-v2`.
2. User A logs out.
3. User B logs in. If the network is slow or unavailable, User B receives User A's cached participant data, which may include participants at a different site.

The Cache API has no user-scoping mechanism. The auth token in the request header is part of the cache key (via the `Request` object), but different users hitting the same URL path will have different tokens, so this partially mitigates the issue. **However**, the `caches.match(request)` fallback uses the URL as the primary key by default (ignoring `Vary` headers), so responses from different users for the same endpoint **may collide**.

**Recommendation:**
- Clear the API cache on logout.
- Use cache keys that include a user identifier.
- Add `ignoreVary: false` explicitly to `caches.match()` and ensure the server sends appropriate `Vary: Authorization` headers.

### C-05: `_apply_generic_update()` Only Logs but Never Mutates Entities

**File:** `backend/app/services/sync.py:339-356`

The `_apply_generic_update()` handler for `stool_kit_issue` and `event_participant_update` mutations only creates an `AuditLog` entry. It does not look up or modify any actual entity. The payload data is written into the audit log's `new_values` JSON, but the actual database record is never updated.

This means: a field worker goes offline, issues a stool kit to a participant, comes back online, syncs, and the mutation is "applied" but the actual stool kit record is never created or updated. The audit trail says it happened, but the data model is unchanged.

**Recommendation:** Implement actual entity lookups and mutations for these types, or mark them as "logged-only" mutations in the docs and ensure the client knows these are advisory-only.

---

## Moderate Issues

### M-01: No Idempotency Protection on `process_push()` (Duplicate Application on Retry)

**File:** `backend/app/services/sync.py:62-140`

The `process_push()` method has no request-level idempotency key. If the client sends a push, the server applies all mutations and commits, but the HTTP response is lost (network error), the client will retry the entire batch. The `_apply_sample_register()` has an `offline_id` check (line 252-259), but:

1. The check relies on `Sample.notes.ilike(f"%offline_id:{offline_id}%")` which is fragile (SQL LIKE on a text field).
2. Other mutation types (`participant_checkin`, `sample_status_update`) have **no idempotency protection at all**. A retried `sample_status_update` will be applied again if the timestamp check passes.

**Recommendation:** Add a server-side `SyncMutation` table that records processed `mutation.id` values. Before applying any mutation, check if its ID has already been processed.

### M-02: Service Worker `processSyncQueue()` Clears ALL Mutations on Success, Ignoring Per-Mutation Errors

**File:** `frontend/public/sw.js:253-260`

When the server responds with `200 OK`, the service worker deletes **all** mutations from IndexedDB, regardless of whether the server response reports per-mutation errors. The server response includes `errors: [...]` with mutation IDs, but this is ignored. Compare with `sync-manager.ts:130-138` which correctly handles per-mutation errors.

This means the background sync path (via the service worker) and the foreground sync path (via `sync-manager.ts`) have **inconsistent error handling**. Mutations that fail server-side will be silently dropped when synced via the background sync path.

**Recommendation:** In `processSyncQueue()`, parse the response errors array and only delete mutations that were not in the errors list, matching the logic in `sync-manager.ts`.

### M-03: Timestamp Conflict Detection Uses Client Clock (Clock Skew Vulnerability)

**File:** `backend/app/services/sync.py:151-156, 199-200`

Conflict detection compares `client_dt` (parsed from the client's ISO timestamp) against `participant.updated_at` (server timestamp). If the client's clock is ahead of the server clock, mutations from the client will have future timestamps and will always pass the conflict check (`server.updated_at < client_dt`), overwriting concurrent server edits.

In field conditions with tablets that may have incorrect time settings, this is a real risk.

**Recommendation:** Use server-side logical clocks (version numbers) or compare against the `last_sync_time` the server recorded for this device, rather than trusting client timestamps.

### M-04: Access Token Stored in IndexedDB Without Encryption

**File:** `frontend/src/lib/offline-store.ts:301-305`

The JWT access token is stored in IndexedDB via `setMeta('access_token', token)` as plain text. IndexedDB is accessible to any JavaScript running on the origin. While this is standard for SPAs, the combination of:

1. A PWA that persists data offline for extended periods
2. Field devices that may be shared between users
3. A service worker that uses this token for background sync

...creates a scenario where a stale token could persist in IndexedDB long after the user has "logged out" of the application if the logout flow does not explicitly clear the meta store.

**Recommendation:** Ensure the logout flow calls `setMeta('access_token', null)` and `clearCache()`. Consider using short-lived tokens with rotation, and clearing IndexedDB on `visibilitychange` to `hidden` after a timeout.

### M-05: Service Worker Auto-Update Forces Page Reload During Active Use

**File:** `frontend/src/lib/service-worker-registration.ts:29-45`

When a new service worker version is detected, the code immediately sends `SKIP_WAITING` (line 33), which activates the new service worker. This triggers a `controllerchange` event, which calls `window.location.reload()` (line 41-44).

If a field worker is in the middle of filling out a form or recording data (especially offline), an auto-reload will lose all unsaved form state. The `refreshing` flag only prevents double-reload, not data loss.

**Recommendation:** Show a toast notification ("Update available, click to reload") instead of auto-reloading. Let the user choose when to activate the update.

### M-06: `entity_types` Parameter in Pull Endpoint is Not Validated

**File:** `backend/app/schemas/sync.py:22-28`, `backend/app/services/sync.py:367-368`

The `entity_types` field is `list[str] | None` with no validation. A client can send `entity_types: ["__proto__", "constructor"]` or arbitrary strings. The service code checks `if "participants" in entity_types` which is safe, but there is no whitelist validation in the schema. More importantly, the endpoint does not reject unknown entity types, meaning a client cannot distinguish between "I asked for an entity type the server doesn't support" and "there's simply no data."

**Recommendation:** Add a Pydantic validator that limits `entity_types` to `{"participants", "samples"}`.

### M-07: IndexedDB Singleton Connection Can Become Stale

**File:** `frontend/src/lib/offline-store.ts:38-76`

The `dbInstance` singleton is cached and reused. While there is an `onclose` handler (line 68) that nullifies it, IndexedDB connections can become stale in other ways (e.g., version upgrade from another tab). If two tabs are open and one triggers a version upgrade, the other tab's cached `dbInstance` will throw `InvalidStateError` on subsequent operations.

**Recommendation:** Add an `onversionchange` handler that closes and nullifies the connection:
```typescript
dbInstance.onversionchange = () => {
  dbInstance?.close()
  dbInstance = null
}
```

---

## Low-Priority Observations

### L-01: Offline Duplicate Detection via Notes Field Is Fragile

**File:** `backend/app/services/sync.py:252-259`

Using `Sample.notes.ilike(f"%offline_id:{offline_id}%")` to detect duplicate offline sample registrations is brittle. If a user manually edits the notes field to include the text `offline_id:`, it could cause false positives. A dedicated `offline_id` column or a separate deduplication table would be more robust.

### L-02: No Maximum Retry Limit on Failed Mutations in IndexedDB

**File:** `frontend/src/lib/offline-store.ts:147-148`

The `updateMutationStatus` increments `retryCount` on failure, but nothing reads this count to abandon permanently failed mutations. The `sync-manager.ts` has `MAX_RETRIES = 5` for the sync engine, but individual mutations can accumulate in IndexedDB indefinitely with `status: 'failed'`, growing the queue without bound.

### L-03: Pull Data Serialization Uses Python String Coercion as Fallback

**File:** `backend/app/services/sync.py:383-410`

Multiple fields use the pattern `p.age_group.value if hasattr(p.age_group, 'value') else p.age_group`. This `hasattr` guard suggests uncertainty about whether the value is an enum or a string. If the database returns a raw string (e.g., after a direct SQL update), the serialization works but bypasses enum validation, potentially sending invalid values to the client.

### L-04: `SyncPushResponse` Schema Defined but Never Used

**File:** `backend/app/schemas/sync.py:41-46`

The `SyncPushResponse` and `SyncConflictResponse` Pydantic models are defined but the route handler returns a raw `dict` (`response_model=dict`). The schema validation is never applied to the outgoing response.

### L-05: `useOfflineQueue` Polls at 5-Second Intervals

**File:** `frontend/src/hooks/useOffline.ts:62`

Polling IndexedDB every 5 seconds is functional but inefficient. Consider using a `BroadcastChannel` or custom event to notify the hook when a mutation is queued, instead of polling.

---

## Summary Table

| ID   | Severity | Component            | Issue                                            |
|------|----------|----------------------|--------------------------------------------------|
| C-01 | CRITICAL | sync service         | No savepoint boundaries; partial batch commit     |
| C-02 | CRITICAL | sync service         | Pull returns all data without site scoping        |
| C-03 | CRITICAL | sync service         | Offline sample creation skips `sample_code` gen   |
| C-04 | CRITICAL | service worker       | API cache leaks data between users on shared device |
| C-05 | CRITICAL | sync service         | Generic mutations log-only, never update entities |
| M-01 | MODERATE | sync service         | No idempotency key; retries re-apply mutations    |
| M-02 | MODERATE | service worker       | Background sync ignores per-mutation errors       |
| M-03 | MODERATE | sync service         | Client clock skew defeats conflict detection      |
| M-04 | MODERATE | offline store        | Access token stored plain-text, not cleared on logout |
| M-05 | MODERATE | SW registration      | Auto-reload on update causes data loss mid-form   |
| M-06 | MODERATE | sync schemas         | `entity_types` not validated against whitelist     |
| M-07 | MODERATE | offline store        | IndexedDB singleton stale on version change       |
| L-01 | LOW      | sync service         | Duplicate detection via LIKE on notes field        |
| L-02 | LOW      | offline store        | No max retry limit for individual mutations        |
| L-03 | LOW      | sync service         | hasattr enum fallback suggests type uncertainty    |
| L-04 | LOW      | sync schemas         | Response schema defined but not used by route      |
| L-05 | LOW      | useOffline hook      | 5s polling; could use BroadcastChannel instead     |

---

## Recommended Fix Priority

1. **C-01** (savepoints) - Data corruption is the worst possible outcome.
2. **C-02** (site scoping) - Data exposure across sites violates study protocols.
3. **C-03** (sample_code) - Offline sample registration is broken without this.
4. **C-04** (cache leakage) - Shared field devices make this a real privacy risk.
5. **C-05** (generic mutations) - Silent no-op creates false sense of data being saved.
6. **M-02** (SW error handling) - Background sync path silently drops failed mutations.
7. **M-01** (idempotency) - Network retries will duplicate data.
8. **M-05** (auto-reload) - Field workers losing form data is a UX emergency.
