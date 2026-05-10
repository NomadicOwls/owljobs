---
phase: 02-employer-breadth-seo
plan: "03"
subsystem: workers/ingest
tags: [seo, google-indexing, tdd, source-contract]
dependency_graph:
  requires: [02-01, 02-02]
  provides: [SEO-03-creation-pings, SEO-03-description-pings]
  affects: [workers/ingest/src/ingest.ts, workers/ingest/src/enrich.ts, workers/ingest/src/index.ts]
tech_stack:
  added: []
  patterns: [source-contract-test, tdd-red-green, shared-budget-object]
key_files:
  created:
    - workers/ingest/test/creation-ping.test.ts
    - workers/ingest/test/description-ping.test.ts
  modified:
    - workers/ingest/src/ingest.ts
    - workers/ingest/src/enrich.ts
    - workers/ingest/src/index.ts
decisions:
  - buildPublicUrl uses niche.domain (NOT canonical_url) per Pitfall 8 — owljobs.com URL is what Google can crawl
  - CREATION_PING_BUDGET=50 declared at ingestNiche scope (shared across ALL targets) to prevent 9×50=450 ping overrun
  - DESCRIPTION_PING_BUDGET=50 in enrich.ts; combined with expire.ts PING_BUDGET=100 keeps total ≤200/day
  - index.ts included in Task 3 commit (not in orchestrator allowlist) — saJson wiring required for end-to-end correctness
  - Phase 1 expire.ts pings canonical_url (Pitfall 8 bug) — documented, NOT fixed here; separate ticket required
metrics:
  duration: ~15 minutes
  completed: 2026-05-11
  tasks: 3/3
  files: 5 (3 modified, 2 created)
---

# Phase 2 Plan 03: Google Indexing API — Creation and Description-Update Pings Summary

**One-liner:** Added SEO-03 Google Indexing API pings on job creation (all 5 ATS adapters) and description-update, with budget caps and `buildPublicUrl` helper correcting the Pitfall 8 canonical_url bug.

## What Was Built

Extended the Google Indexing API integration (previously fire-on-expiry only) to also fire:
- **On job creation** — in all 5 `ingestX` functions (Workday, Greenhouse, SuccessFactors, Recruitee, Softgarden) inside the `if (inserted)` branch
- **On description update** — in `enrich.ts` after each successful `db.update({ description })` call

### Key Implementation Details

**`buildPublicUrl(niche, jobId)`** — defined independently in both `ingest.ts` and `enrich.ts` (no cross-import to avoid circular dependency). Produces `https://${niche.domain}/jobs/${jobId.slice(0, 12)}`, matching the slug pattern in `apps/web/src/lib/slug.ts`.

**Shared budget (creation)** — `const budget = { remaining: CREATION_PING_BUDGET }` declared in `ingestNiche` scope BEFORE `targets.map(...)`. All 5 ingestX functions receive this same object reference via the new `budget?: { remaining: number }` parameter. This prevents 9 targets × 50 = 450 pings blowing the 200/day quota on the first cron run.

**Budget cap (description)** — `const budget = { remaining: DESCRIPTION_PING_BUDGET }` inside `enrichPendingJobs`. Caps at 50 per enrich-run.

**Total quota math** — `expire.ts` caps at 100/run + creation 50/run + description 50/run = 200/run maximum, matching the daily API quota.

**saJson gate** — Pings are silently skipped when `saJson` is absent, matching the existing `expire.ts` behavior.

## Test Results

| Test Suite | Tests | Result |
|---|---|---|
| creation-ping.test.ts | 7 | PASS |
| description-ping.test.ts | 5 | PASS |
| upsert.test.ts | 1 | PASS (no regression) |
| expire.test.ts | 8 | PASS (no regression) |
| google-indexing.test.ts | 3 | PASS (no regression) |
| wave1.test.ts | 9 | PASS (no regression) |
| **Total** | **33** | **ALL PASS** |

TypeScript: `npx tsc --noEmit` — clean (no errors).

## Deviations from Plan

### Scope Expansion

**`index.ts` included in Task 3 commit (not in orchestrator allowlist)**
- **Found during:** Task 3 planning
- **Issue:** Without threading `env.GOOGLE_INDEXING_KEY` into `enrichPendingJobs` in the queue handler and `/enrich-now` endpoint, `saJson` would always be `undefined` and description pings would never fire in production. The plan's acceptance criteria explicitly required `grep -q "enrichPendingJobs(niche, db, env.GOOGLE_INDEXING_KEY)" workers/ingest/src/index.ts`.
- **Fix:** Added `index.ts` to Task 3 commit as Rule 2 (missing critical functionality for correct operation).
- **Files modified:** `workers/ingest/src/index.ts`
- **Commit:** c92afae

## Known Stubs

None — all ping paths are fully wired.

## Runbook Note

**Phase 1 bug (do NOT fix in Phase 2):** `expire.ts` line 86 pings `job.canonical_url` (the employer's ATS URL) instead of the owljobs.com public URL. This is the Pitfall 8 bug. Phase 2 (Plan 03) establishes the correct `buildPublicUrl` pattern for new ping sites. A separate ticket is required to fix `expire.ts` — changing it here was explicitly out of scope.

## Threat Surface Scan

No new network endpoints introduced. `buildPublicUrl` constructs URLs from `niche.domain` (static config) and `jobId` (sha256 hex from upsertJob), providing no injection surface. Threat register T-02-07, T-02-08, T-02-09 all mitigated as planned.

## Self-Check: PASSED

Files exist:
- `workers/ingest/test/creation-ping.test.ts` — FOUND
- `workers/ingest/test/description-ping.test.ts` — FOUND
- `workers/ingest/src/ingest.ts` (modified) — FOUND
- `workers/ingest/src/enrich.ts` (modified) — FOUND
- `workers/ingest/src/index.ts` (modified) — FOUND

Commits:
- 085af74 — test(02-03): add failing source-contract tests for creation and description pings
- 2035b05 — feat(02-03): add buildPublicUrl + creation pings to ingest.ts
- c92afae — feat(02-03): add description-update pings to enrich.ts + wire saJson in index.ts
