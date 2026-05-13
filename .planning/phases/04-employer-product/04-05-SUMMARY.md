---
phase: 04-employer-product
plan: "05"
subsystem: analytics-write
tags: [phase-4, employer-product, analytics, cloudflare-analytics-engine, server-side-tracking]
dependency_graph:
  requires: [04-01]
  provides: [ANLYT-01-write-side]
  affects: [04-08]
tech_stack:
  added: []
  patterns: [cloudflare-analytics-engine-write, fire-and-forget-tracking, server-side-event-capture]
key_files:
  created:
    - apps/web/src/pages/api/track.ts
  modified:
    - apps/web/src/pages/jobs/[slug].astro
decisions:
  - D-09: CF Analytics Engine confirmed as tracking backend — no Supabase write per event
  - D-10: Event writes are server-side in Pages Functions — ad-blocker proof
key_decisions:
  - isSafeRedirect patches protocol-relative URL bypass (//evil.com); prescribed code had a gap
  - View events only fire on non-expired (active) job renders — isExpired guard added
metrics:
  duration: ~15 minutes
  completed: "2026-05-13"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 4 Plan 05: Analytics Write Side (ANLYT-01) Summary

Server-side Cloudflare Analytics Engine write pipeline: job-view events on every active /jobs/[slug] render, apply-click events via GET /api/track redirect. Ad-blocker proof, fire-and-forget, multi-niche compliant.

## Files Touched

| File | Action | Lines |
|------|--------|-------|
| `apps/web/src/pages/api/track.ts` | Created | 54 |
| `apps/web/src/pages/jobs/[slug].astro` | Modified (+17 lines) | 405 total |

## Task Commits

| Task | Name | Commit |
|------|------|--------|
| 1 | GET /api/track endpoint | `70058a0` |
| 2 | /jobs/[slug].astro view-event write | `5328529` |

## What Was Built

### Task 1: GET /api/track (70058a0)

New endpoint `apps/web/src/pages/api/track.ts`:
- Writes `AnalyticsEngineDataset.writeDataPoint({ blobs: [jobId, type, niche.id, employerId], doubles: [1], indexes: [jobId] })` fire-and-forget
- `type=apply` + `redirect` query param: validates redirect URL with `isSafeRedirect`, then 302-redirects
- `type=apply` without redirect: 400
- `type=view` (or other): 204 No Content (beacon-style)
- Pitfall 4 guard: `if (analytics && typeof analytics.writeDataPoint === "function")` — skips silently in local dev where ANALYTICS binding is unavailable

### Task 2: /jobs/[slug].astro view-event (5328529)

Added ANLYT-01 view-event write block to frontmatter of `apps/web/src/pages/jobs/[slug].astro`:
- Placed after `if (!job) return Astro.redirect("/404")` gate and `isExpired` cache-header block
- Wrapped in `if (!isExpired)` — expired jobs (410 response) are NOT tracked as view events
- `blobs: [job.id, "view", niche.id, job.employer_id ?? ""]`
- Pitfall 4 guard included — render never blocked

## Multi-Niche Compliance

- `niche.id` flows into `blobs[2]` in both files — no hardcoded `wind-turbine` literal
- `grep -c "wind-turbine" apps/web/src/pages/api/track.ts apps/web/src/pages/jobs/[slug].astro` → `0 / 0`

## FEAT-04 Traceability

FEAT-04 (homepage employer carousel) is DEFERRED to Phase 5 per D-15. Listed in this plan's `requirements` frontmatter for traceability only — no implementation shipped.

## Dashboard Read Side

`/api/stats` endpoint and StatTile UI dashboard components ship in plan 08 (read side of ANLYT-01).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed protocol-relative URL open-redirect bypass in `isSafeRedirect`**

- **Found during:** Task 1 (pre-write analysis)
- **Issue:** Prescribed code `if (url.startsWith("/")) return true` allows `//evil.com/path` — browsers treat protocol-relative URLs as `https://evil.com`. T-04-22 explicitly requires blocking all non-http(s) and non-same-origin redirects.
- **Fix:** Changed guard to `if (url.startsWith("/") && !url.startsWith("//")) return true`
- **Files modified:** `apps/web/src/pages/api/track.ts`
- **Commit:** `70058a0`

**2. [Rule 2 - Missing Critical Functionality] Added `if (!isExpired)` guard on view-event write**

- **Found during:** Task 2 (pre-write analysis)
- **Issue:** The plan's instruction placed the write block "after the 410 branch" but the 410 path in [slug].astro does NOT return — it sets `Astro.response.status = 410` and falls through to the template. Without an explicit guard, expired jobs would emit "view" events inflating analytics.
- **Fix:** Wrapped the analytics write in `if (!isExpired)` so it only fires on active, viewable renders
- **Files modified:** `apps/web/src/pages/jobs/[slug].astro`
- **Commit:** `5328529`

## Pre-existing Typecheck Failures (Out of Scope)

`pnpm --filter @owljobs/web typecheck` exits non-zero due to two pre-existing errors in files not touched by this plan:
- `src/components/Header.astro:5` — `Object is possibly 'undefined'` (ts2532)
- `src/components/ui/Input.astro:17` — `Type 'string' is not assignable to 'HTMLInputTypeAttribute'` (ts2322)

These errors predate plan 05. No new errors introduced by this plan's changes.

## Threat Surface Scan

No new threat surface introduced beyond what the plan's threat model covers:
- T-04-22 (open-redirect) — mitigated by `isSafeRedirect` with protocol-relative fix
- T-04-23 (event spoofing) — accepted per threat model
- T-04-24 (job ID enumeration) — accepted per threat model
- T-04-25 (DoS spam writes) — accepted per threat model

## Manual Verification Steps (Post-Deploy)

1. Visit `/jobs/<any-active-slug>` — check CF Dashboard > Analytics Engine > owljobs_events dataset. Expect a row with blob1=jobId, blob2="view".
2. Visit `/api/track?job=X&type=apply&redirect=https://example.com/apply` — expect 302 to `https://example.com/apply`.
3. Visit `/api/track?job=X&type=apply&redirect=javascript:alert(1)` — expect 400 (open-redirect blocked).
4. Visit `/api/track?job=X&type=apply&redirect=//evil.com` — expect 400 (protocol-relative blocked).
5. Visit `/api/track?job=X&type=view` — expect 204 No Content.
6. Visit `/api/track?type=view` (no job param) — expect 400.

## Self-Check: PASSED

- FOUND: `apps/web/src/pages/api/track.ts`
- FOUND: `apps/web/src/pages/jobs/[slug].astro` (modified)
- FOUND: `.planning/phases/04-employer-product/04-05-SUMMARY.md`
- FOUND commit `70058a0` (Task 1)
- FOUND commit `5328529` (Task 2)
