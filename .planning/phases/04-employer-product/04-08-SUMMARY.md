---
phase: 04-employer-product
plan: "08"
subsystem: dashboard
tags: [phase-4, employer-product, dashboard, analytics-read, PROF-04, PROF-05, PROF-06, ANLYT-01]
dependency_graph:
  requires: ["04-01", "04-04", "04-05", "04-07"]
  provides: ["PROF-04", "PROF-05", "PROF-06", "ANLYT-01"]
  affects: ["/dashboard", "/api/stats", "dashboard components"]
tech_stack:
  added: []
  patterns:
    - "Server-side fetch of /api/stats with cookie forwarding for SSR auth"
    - "EMPLOYER_ID_RE /^[a-f0-9]{64}$/ regex validation before CF Analytics Engine SQL embedding (Pitfall 5)"
    - "IDOR guard: requested employer_id compared to session employer_id before SQL"
    - "exactOptionalPropertyTypes fix: conditional spread / ?? null coercion for optional Astro props"
    - "supabaseAdmin for subscriber count (RLS blocks anon reads on subscribers table)"
key_files:
  created:
    - apps/web/src/components/dashboard/DashboardLayout.astro
    - apps/web/src/components/dashboard/DashboardNav.astro
    - apps/web/src/components/dashboard/StatTile.astro
    - apps/web/src/components/dashboard/FeaturedToggle.astro
    - apps/web/src/components/dashboard/JobRow.astro
    - apps/web/src/components/dashboard/LockedFeatureCard.astro
    - apps/web/src/components/dashboard/ProfileEditorPreview.astro
    - apps/web/src/components/dashboard/LogoUploadPreview.astro
    - apps/web/src/components/dashboard/SubscriberMatchCard.astro
    - apps/web/src/pages/dashboard.astro
    - apps/web/src/pages/api/stats.ts
    - apps/web/src/pages/api/auth/signout.ts
  modified: []
decisions:
  - "Conditional Layout render in DashboardLayout (two branches) to satisfy exactOptionalPropertyTypes"
  - "Pass ?? 0 for views/clicks/applies in JobRow to avoid optional prop type error"
  - "domain ?? null in LogoUploadPreview to coerce undefined to null for EmployerLogo"
  - "Conditional SubscriberMatchCard render (totalAudience branch) to avoid passing undefined to non-optional prop"
metrics:
  duration: "~35 minutes"
  completed: "2026-05-13"
  task_count: 3
  file_count: 12
---

# Phase 4 Plan 8: Employer Dashboard Summary

Employer dashboard vertical slice: auth-gated /dashboard with profile view, 30-day analytics tiles, featured-job toggles, locked profile/logo previews, and subscriber match card — backed by /api/stats querying CF Analytics Engine with SQL injection guard.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Scaffolding — DashboardLayout, DashboardNav, dashboard.astro, signout | a984e24 | DashboardLayout.astro, DashboardNav.astro, dashboard.astro, signout.ts |
| 2 | Stats + jobs — StatTile, FeaturedToggle, JobRow, /api/stats | 5052051 | StatTile.astro, FeaturedToggle.astro, JobRow.astro, stats.ts, dashboard.astro |
| 3 | Locked previews + SubscriberMatchCard | 5a80737 | LockedFeatureCard.astro, ProfileEditorPreview.astro, LogoUploadPreview.astro, SubscriberMatchCard.astro, dashboard.astro |

## Files Created

| File | Lines | Role |
|------|-------|------|
| apps/web/src/components/dashboard/DashboardLayout.astro | 27 | 2-column Layout wrapper with DashboardNav |
| apps/web/src/components/dashboard/DashboardNav.astro | 62 | Desktop left rail + mobile bottom-fixed nav (icon + label, aria-current) |
| apps/web/src/components/dashboard/StatTile.astro | 15 | Eyebrow + tabular-nums value + graceful null fallback |
| apps/web/src/components/dashboard/FeaturedToggle.astro | 35 | aria-pressed button for /api/jobs/[id]/featured |
| apps/web/src/components/dashboard/JobRow.astro | 35 | Job card with inline view/click/apply counts + FeaturedToggle |
| apps/web/src/components/dashboard/LockedFeatureCard.astro | 18 | opacity-60 overlay + "Available on paid plan" banner |
| apps/web/src/components/dashboard/ProfileEditorPreview.astro | 37 | Disabled profile edit form (7 disabled attributes) |
| apps/web/src/components/dashboard/LogoUploadPreview.astro | 22 | EmployerLogo + disabled upload button |
| apps/web/src/components/dashboard/SubscriberMatchCard.astro | 22 | text-accent count + niche-scoped sub-label |
| apps/web/src/pages/dashboard.astro | 165 | Auth-gated SSR page orchestrating all sections |
| apps/web/src/pages/api/stats.ts | 79 | CF Analytics Engine SQL API + EMPLOYER_ID_RE guard + IDOR check |
| apps/web/src/pages/api/auth/signout.ts | 16 | GET → signOut → redirect / |

## Auth Guard Flow

- No session → redirect `/login`
- Session but no employerId → redirect `/employers`
- Session + employerId but employer row not found → redirect `/employers`
- Session + employerId + employer row → dashboard renders

## /api/stats Injection Guard Test

- `EMPLOYER_ID_RE = /^[a-f0-9]{64}$/` defined at module level (line 5)
- Test runs on line 34 — before `const sql = ...` (line 42)
- Ordering verified: regex guard appears before SQL string in file
- Niche.id validated with `/^[a-z0-9-]{1,64}$/` for defence-in-depth
- IDOR check: `requested !== employerIdSession` → 403
- CF API error → graceful 200 with zeros (no crash, StatTile shows "—")
- Manual SQL injection test: `?employer_id=' OR 1=1--` → 400 (64-char hex check fails)
- Multi-niche: niche.id interpolated from `locals.niche.id` (no hardcoded literal)

## dashboard.astro confirmations

- Does NOT call `setCacheHeaders` (auth pages must not cache) — verified
- No `wind_turbine` or `wind-turbine` literals — verified (grep count: 0)
- Subscriber query uses `niche.supabaseSchema` — no hardcoded schema name

## Note: ANLYT-02

Weekly alert email delivery ships in plan 10. This plan ships the dashboard read side (subscriber count from `subscribers` table using `supabaseAdmin` to bypass RLS).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed JSX expression syntax in DashboardNav icon rendering**
- **Found during:** Task 1 pre-write (advisor review)
- **Issue:** Plan's icon template used `{item.icon === "x" && <elem1 /><elem2 />}` — multiple sibling nodes after `&&` is invalid Astro/JSX syntax
- **Fix:** Wrapped each icon's children in a fragment: `{item.icon === "x" && (<><elem1 /><elem2 /></>)}`
- **Files modified:** apps/web/src/components/dashboard/DashboardNav.astro

**2. [Rule 1 - Bug] Fixed exactOptionalPropertyTypes violations (3 instances)**
- **Found during:** Tasks 1-3 typecheck
- **Issue:** `exactOptionalPropertyTypes: true` in tsconfig rejects `prop={maybeUndefined}` where the prop type is `?: string` — TypeScript treats `undefined` as not assignable
- **Fix 1:** DashboardLayout: conditional two-branch `<Layout>` render (description branch / no-description branch)
- **Fix 2:** dashboard.astro JobRow: `views={j?.views ?? 0}` instead of `views={j?.views}`
- **Fix 3:** LogoUploadPreview: `domain={employer.domain ?? null}` to coerce `undefined` → `null`
- **Fix 4:** dashboard.astro SubscriberMatchCard: conditional render with/without `totalAudience`
- **Files modified:** DashboardLayout.astro, LogoUploadPreview.astro, dashboard.astro

**3. [Rule 1 - Bug] Fixed unused `redirect` destructure in signout.ts**
- **Found during:** Task 1 typecheck (warning ts6133)
- **Fix:** Removed `redirect` from APIContext destructure
- **Files modified:** apps/web/src/pages/api/auth/signout.ts

**4. [Rule 1 - Bug] Fixed `body: undefined` type error in fetch call**
- **Found during:** Task 2 typecheck (ts2769 — no overload matches)
- **Issue:** CF Workers fetch typing rejects `body: undefined`
- **Fix:** Conditional spread: `...(method === "POST" ? { body: "{}" } : {})`
- **Files modified:** apps/web/src/pages/dashboard.astro (inline script)

## Known Stubs

- SubscriberMatchCard renders live subscriber count from DB (not stubbed)
- StatTile renders from /api/stats (real CF Analytics Engine query — returns zeros if no data yet, shows "—" on API error)
- FeaturedToggle wired to /api/jobs/[id]/featured (plan 04 endpoint, live)
- No stubs that prevent plan goals from being achieved

## Threat Surface Scan

All surfaces covered by plan threat model:
| Flag | File | Description |
|------|------|-------------|
| T-04-09 mitigated | api/stats.ts | SQL injection via employer_id — EMPLOYER_ID_RE validates before embed |
| T-04-10 mitigated | api/stats.ts | IDOR — requested vs session employer_id check |
| T-04-34 mitigated | dashboard.astro | No setCacheHeaders on auth page |
| T-04-35 mitigated | dashboard.astro + api/stats.ts | employer_id from session only; query param rejected if mismatch |

No new threat surfaces introduced beyond plan threat model.

## Self-Check

Files exist:
- FOUND: apps/web/src/components/dashboard/DashboardLayout.astro
- FOUND: apps/web/src/components/dashboard/DashboardNav.astro
- FOUND: apps/web/src/components/dashboard/StatTile.astro
- FOUND: apps/web/src/components/dashboard/FeaturedToggle.astro
- FOUND: apps/web/src/components/dashboard/JobRow.astro
- FOUND: apps/web/src/components/dashboard/LockedFeatureCard.astro
- FOUND: apps/web/src/components/dashboard/ProfileEditorPreview.astro
- FOUND: apps/web/src/components/dashboard/LogoUploadPreview.astro
- FOUND: apps/web/src/components/dashboard/SubscriberMatchCard.astro
- FOUND: apps/web/src/pages/dashboard.astro
- FOUND: apps/web/src/pages/api/stats.ts
- FOUND: apps/web/src/pages/api/auth/signout.ts

Commits exist:
- FOUND: a984e24
- FOUND: 5052051
- FOUND: 5a80737

## Self-Check: PASSED
