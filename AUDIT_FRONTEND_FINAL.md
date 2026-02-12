# Phase 9 — Frontend Code Audit

**Auditor:** frontend-auditor agent
**Date:** 2026-02-12
**Scope:** All frontend source files under `frontend/src/`
**Files reviewed:** ~50+ files (API hooks, feature pages, core libs, stores, components, router)

---

## Critical Findings

### C-01: useDebounce uses useMemo instead of useEffect — broken cleanup

**File:** `frontend/src/features/samples/SampleRegisterForm.tsx:44-51`

The custom `useDebounce` hook uses `useMemo` instead of `useEffect`. The cleanup function returned from `useMemo` is never called by React, so timers accumulate on every render and the debounce behavior is broken.

```tsx
function useDebounce(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value)
  useMemo(() => {                              // BUG: should be useEffect
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)           // cleanup is never invoked
  }, [value, delay])
  return debounced
}
```

**Fix:** Replace `useMemo` with `useEffect`.

**Note:** Other files (`InstrumentDashboardPage.tsx:154`, `InstrumentRunsPage.tsx`) implement `useDebounce` correctly with `useEffect`. Consider extracting a single shared hook.

---

### C-02: JWT stored in localStorage — XSS exfiltration risk

**File:** `frontend/src/lib/api.ts:19`

The auth token is read from `localStorage.getItem('auth-storage')` via the Zustand persist middleware. If an XSS vulnerability exists anywhere in the application, an attacker can exfiltrate the JWT with a single `localStorage.getItem()` call.

**Recommendation:** Migrate to `httpOnly` cookies set by the backend. If localStorage must be used, ensure a strict Content Security Policy is in place and all user-generated content is sanitized.

---

### C-03: RBAC mismatch — sidebar hides routes the router permits

**File:** `frontend/src/components/layout/Sidebar.tsx:42-44` vs `frontend/src/router.tsx:139`

The sidebar only shows the "Create Participant" link for `super_admin` and `lab_manager` roles, but the router's `RoleGuard` permits `super_admin`, `lab_manager`, `data_entry`, and `field_coordinator`. Users with `data_entry` or `field_coordinator` roles can access the page via direct URL but have no navigation link to reach it.

**Fix:** Align sidebar visibility with the router guard, or restrict the router guard to match the sidebar.

---

## Important Findings

### I-01: Missing React Fragment key on grid rows

**File:** `frontend/src/features/storage/BoxDetailPage.tsx:256`

Grid rows are wrapped in a bare `<>` Fragment inside `.map()` without a `key` prop. React cannot efficiently reconcile these elements, which may cause rendering bugs or performance issues.

```tsx
{rows.map((letter, ri) => (
  <>  {/* Missing key */}
    <div key={`lbl-${ri}`}>{letter}</div>
    {cols.map((_, ci) => ( ... ))}
  </>
))}
```

**Fix:** Use `<Fragment key={...}>` (named import from React).

---

### I-02: Missing React Fragment key on grid rows (duplicate pattern)

**File:** `frontend/src/features/instruments/PlateDesignerPage.tsx:123`

Same pattern as I-01 — bare `<>` Fragment without key inside `rowLabels.map()`.

---

### I-03: WellRow Fragment without key

**File:** `frontend/src/features/instruments/PlateDetailPage.tsx:358`

`WellRow` component returns a Fragment wrapping multiple cells. When rendered inside a list, this Fragment lacks a key prop.

---

### I-04: Quick links use `<a>` tags instead of React Router `<Link>`

**File:** `frontend/src/pages/DashboardPage.tsx:170-181`

Dashboard quick-action links use `<a href="...">` instead of `<Link to="...">` from react-router-dom. This causes full page reloads, losing all client-side state (auth, query cache, form state).

**Fix:** Replace `<a href>` with `<Link to>`.

---

### I-05: useImportDetail called with empty string

**File:** `frontend/src/features/partners/ImportHistoryPage.tsx:52`

When no import is selected, `useImportDetail('')` is called. Although the hook has an `enabled: !!id` guard so it won't fire a request, it still creates a query cache entry with an empty-string key, which is wasteful and can cause confusion during debugging.

**Fix:** Pass `selectedId ?? undefined` and adjust the hook's type to accept `string | undefined`.

---

### I-06: Field event mutations lack toast notifications

**File:** `frontend/src/api/field-events.ts` (entire file)

All mutation hooks (`useCreateFieldEvent`, `useUpdateFieldEvent`, `useDeleteFieldEvent`, `useBulkDigitize`) only invalidate queries on success. They do not show toast notifications for success or error, unlike other API modules (e.g., `samples.ts`, `participants.ts`) that provide user feedback.

**Fix:** Add `onSuccess` / `onError` toast notifications consistent with other API hooks.

---

### I-07: Non-null assertions on route params

**File:** `frontend/src/features/instruments/RunDetailPage.tsx:73-76`

```tsx
const { id } = useParams()
const { data: run, isLoading, error } = useRunDetail(id!)
const startRun = useStartRun(id!)
const completeRun = useCompleteRun(id!)
```

`useParams()` returns `string | undefined`, but `id!` asserts it is always defined. If the component is rendered outside a route with `:id`, this will pass `undefined` to hooks, potentially causing API calls to `/runs/undefined`.

**Fix:** Add an early return or redirect when `id` is undefined.

---

### I-08: Module-level mutable counter won't reset between navigations

**File:** `frontend/src/features/reports/QueryBuilderPage.tsx:48`

```tsx
let filterIdCounter = 1
```

This module-level variable persists across component mounts. When the user navigates away and returns, the counter does not reset, producing ever-increasing filter IDs. In React StrictMode or with HMR, the counter may also increment unexpectedly.

**Fix:** Use `useRef` inside the component to scope the counter to the component lifecycle, or use `crypto.randomUUID()` for filter IDs.

---

### I-09: Kanban fetches 200 slides in a single request

**File:** `frontend/src/features/instruments/IccWorkflowPage.tsx:198`

```tsx
const { data, isLoading, error } = useIccSlides({ per_page: 200, ... })
```

Fetching up to 200 slides in one request may cause slow initial loads and large DOM renders. As the dataset grows this will degrade.

**Recommendation:** Implement virtual scrolling or paginated loading within each kanban column.

---

### I-10: useAdvanceIccStatus hook instantiated per SlideCard

**File:** `frontend/src/features/instruments/IccWorkflowPage.tsx:465`

Each `SlideCard` component calls `useAdvanceIccStatus(slide.id)`, creating a separate `useMutation` hook instance per card. With 200 slides, this creates 200 mutation hook instances.

**Fix:** Lift the mutation hook to the parent and pass a callback, or use a single mutation that accepts the slide ID as a parameter.

---

### I-11: Dynamic Tailwind class construction breaks purge/JIT

**File:** `frontend/src/features/reports/EnrollmentDashboardPage.tsx:27`

```tsx
accent.replace('bg-', 'bg-').replace('-500', '-50')
```

Tailwind's JIT compiler cannot detect dynamically constructed class names. Classes like `bg-blue-50` generated at runtime will be missing from the production CSS bundle.

**Fix:** Use a lookup object mapping accent classes to their light variants:
```tsx
const lightVariants: Record<string, string> = {
  'bg-blue-500': 'bg-blue-50',
  'bg-teal-500': 'bg-teal-50',
  // ...
}
```

---

### I-12: Participant detail tabs are placeholder stubs

**File:** `frontend/src/features/participants/ParticipantDetailPage.tsx`

The "Samples" and "Timeline" tabs render placeholder `<div>` elements with "Coming soon" text rather than actual data. Users navigating to these tabs will find them non-functional.

---

### I-13: Stool kit tracker shows raw UUID instead of participant code

**File:** `frontend/src/features/partners/StoolKitTrackerPage.tsx`

The participant column displays `kit.participant_id?.slice(0, 8)` -- a truncated UUID -- instead of the human-readable `participant_code`. This is not useful for lab staff who identify participants by their study code.

**Fix:** Join with participant data to display `participant_code`, or have the backend include it in the stool kit response.

---

### I-14: Module-level pollInterval variable in notification store

**File:** `frontend/src/stores/notifications.ts:17`

```tsx
let pollInterval: ReturnType<typeof setInterval> | null = null
```

The polling interval is stored in a module-level variable. If `startPolling()` is called without a prior `stopPolling()`, the previous interval is orphaned (leaked). Additionally, cleanup depends on explicit `stopPolling()` calls -- if the consuming component unmounts without calling it, polling continues indefinitely.

**Fix:** Guard `startPolling()` to clear any existing interval first. Consider using `useEffect` cleanup in the consuming component to ensure polling stops on unmount.

---

## UX Issues

### U-01: Browser confirm() used for delete actions

**File:** `frontend/src/features/files/FileManagerPage.tsx:183`

File deletion uses `window.confirm()`, which is not styled, not accessible to screen readers, and inconsistent with the rest of the UI which uses shadcn/ui `Dialog` components.

**Fix:** Replace with an `AlertDialog` component from shadcn/ui.

---

### U-02: Many placeholder pages still in router

**File:** `frontend/src/router.tsx`

The following routes render a generic `PlaceholderPage` with "This page is under development":

| Route | Title |
|---|---|
| `/participants/odk-sync` | ODK Sync Status |
| `/samples/processing` | Sample Processing |
| `/field-ops/conflicts` | Sync Conflicts |
| `/partners/results` | Partner Results |
| `/instruments/queue` | Sample Queue |
| `/reports/sites` | Sites Dashboard |
| `/admin/users` | User Management |
| `/admin/users/:id` | User Detail |
| `/admin/replica` | Read Replica Accounts |
| `/admin/audit-logs` | Audit Logs |
| `/admin/access-logs` | Access Logs |
| `/admin/reports` | Scheduled Reports |
| `/admin/settings` | System Settings |
| `/notifications` | Notifications |
| `/profile` | Profile |

These are visible in navigation and accessible via URL. Users clicking them see no useful content.

**Recommendation:** Either hide unfinished routes from navigation or show a more informative "coming soon" message with expected availability.

---

### U-03: ErrorBoundary uses hardcoded colors instead of theme variables

**File:** `frontend/src/components/ErrorBoundary.tsx`

The error boundary uses hardcoded gray hex colors (`#f5f5f5`, `#333`, etc.) instead of Tailwind theme classes or CSS variables. This breaks visual consistency in dark mode and with the application's theming system.

**Fix:** Use Tailwind utility classes (`bg-muted`, `text-foreground`, etc.) or CSS variables.

---

## Summary

| Severity | Count |
|---|---|
| Critical | 3 |
| Important | 14 |
| UX | 3 |
| **Total** | **20** |

### Priority Recommendations

1. **Immediate:** Fix C-01 (broken useDebounce) -- active bug affecting sample registration search.
2. **Short-term:** Fix C-03 (RBAC mismatch) and I-04 (full page reloads on dashboard) -- both affect daily user experience.
3. **Plan for:** C-02 (JWT storage migration) -- requires backend changes but significantly improves security posture.
4. **Batch fix:** I-01/I-02/I-03 (Fragment keys) -- mechanical fix, low risk.
5. **Track:** I-11 (Tailwind dynamic classes) -- will cause invisible styling bugs in production builds.
