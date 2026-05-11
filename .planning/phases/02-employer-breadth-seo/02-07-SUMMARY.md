---
phase: 02-employer-breadth-seo
plan: "07"
subsystem: ingest / ats-adapters
tags: [trakstar, covg-02, d-10, d-21, pitfall-7, abort-path, source-contract-tests]
dependency_graph:
  requires: [02-04, 02-06]
  provides: [trakstar-adapter-stub, ingestTrakstar]
  affects:
    - packages/ats-adapters/src/trakstar.ts
    - packages/ats-adapters/package.json
    - workers/ingest/src/ingest.ts
    - niches/wind-turbine.ts
tech_stack:
  added: []
  patterns: [abort-documented-stub, source-contract-tests, probe-before-build]
key_files:
  created:
    - packages/ats-adapters/src/trakstar.ts
    - packages/ats-adapters/test/trakstar.test.ts
  modified:
    - packages/ats-adapters/package.json
    - workers/ingest/src/ingest.ts
    - niches/wind-turbine.ts
decisions:
  - "ABORT path taken — Ørsted Trakstar account is inactive (confirmed 2026-05-11 probe)"
  - "ingestTrakstar() wired into ingest.ts dispatch; handles both abort (returns []) and future success path"
  - "Ørsted coverage deferred to Adzuna/JSearch aggregator (Plan 06 queries)"
metrics:
  duration_minutes: 8
  completed_date: "2026-05-11"
  tasks_total: 3
  tasks_completed: 3
  files_created: 2
  files_modified: 3
---

# Phase 2 Plan 07: Trakstar Adapter (Abort Path) Summary

Trakstar adapter probe decision: ABORT. Ørsted's Trakstar account is inactive. Documented stub with T-02-15 evidence; ingest wired; 5 source-contract tests pass.

## Trakstar Probe Outcome

**Date:** 2026-05-11
**URL probed:** https://orsted.hire.trakstar.com
**HTTP status:** 200
**Final URL:** https://orsted.hire.trakstar.com/ (no redirect to login)
**Response size:** ~80 KB
**Finding:** Page displayed "Inactive account — This employer is no longer using Trakstar Hire to collect applications." The response also linked to `https://recruiterbox.com/inactive-ats`. No `window.__NEXT_DATA__`, no `window.__INITIAL_STATE__`, no job listing data of any kind. The Ørsted Trakstar account is definitively defunct.

**Decision: ABORT** per Pitfall 7 (D-10 + concrete abort rule). The abort rule states: "If the page is a login redirect or blank SPA that requires browser JS execution to populate: ABORT." An inactive account with no job data satisfies the abort trigger.

## Path Taken: Abort

- `packages/ats-adapters/src/trakstar.ts` — documented abort stub. Exports `fetchAllTrakstarJobs` (returns `[]`) and `TrakstarAdapterError`. Header comment documents probe date, URL, and exact finding (T-02-15 mitigation).
- `packages/ats-adapters/package.json` — added `./trakstar` subpath export so `ingest.ts` import compiles.
- `workers/ingest/src/ingest.ts` — replaced Plan 04 stub with full `ingestTrakstar()` function. On abort path, `fetchAllTrakstarJobs` returns `[]` → no upserts, no expiry called. Function also handles future success path (jobs > 0 → upsert + expire) if adapter is ever re-enabled.
- `niches/wind-turbine.ts` — Ørsted entry remains commented. Comment updated with abort reason + date.

## Ørsted Coverage Confirmation

Ørsted is covered by aggregator queries in `niches/wind-turbine.ts`:
- `aggregatorQueries` includes: "wind turbine technician", "wind energy technician", "WTG technician", "wind turbine service technician", "wind O&M technician", "wind turbine field service", "wind turbine maintenance"
- Adzuna (5 country targets: us/gb/de/nl/dk) and JSearch (global) both run these queries.
- Ørsted operates in DK, GB, DE, NL — well-covered by the dk/gb/de/nl Adzuna targets.

The abort path does NOT block the 20-employer gate (D-12/D-21 — Wave 1 + SmartRecruiters already covers it).

## Test Results

- `pnpm vitest run packages/ats-adapters/test/trakstar.test.ts`: 5/5 pass
- `pnpm vitest run` (full suite): 116/116 pass (0 regressions)
- `pnpm tsc --noEmit`: clean (ats-adapters + worker-ingest)

## Deviations from Plan

### Auto-added — Rule 3 (blocking)

**1. [Rule 3 - Missing] Added `./trakstar` to package.json exports**
- **Found during:** Task 1 pre-probe check
- **Issue:** `@owljobs/ats-adapters/trakstar` subpath import in ingest.ts would fail at tsc without an export entry.
- **Fix:** Added `./trakstar` entry to `packages/ats-adapters/package.json` exports, matching the pattern of all other adapter subpaths.
- **Files modified:** `packages/ats-adapters/package.json`
- **Commit:** e894173

**2. [Rule 2 - Missing critical] Full `ingestTrakstar()` wired with success path**
- **Found during:** Task 1
- **Issue:** Plan abort path showed `ingestTrakstar` calling `fetchAllTrakstarJobs` and returning early on `[]`. The ingest function also needs to handle the success path correctly if the adapter is ever re-enabled (upsert + expire) — without this, re-enabling would require touching ingest.ts again.
- **Fix:** Implemented full `ingestTrakstar()` with both the abort shortcut (jobs.length === 0 → return) and the complete success path. The function is correct for both states.
- **Files modified:** `workers/ingest/src/ingest.ts`
- **Commit:** e894173

## Checkpoint (Task 2) — Auto-approved (YOLO mode)

Task 2 was `type="checkpoint:human-verify"`. Per YOLO auto-approve policy, auto-approved as "abort: inactive account". Probe result and decision are documented in `trakstar.ts` header comment and this SUMMARY.

## Threat Mitigations

| Threat | Status |
|--------|--------|
| T-02-13 Tampering (Trakstar HTML parsing) | N/A — abort path; no HTML parsed |
| T-02-14 DoS (Trakstar fetch in cron) | Mitigated — returns [] immediately; no retries |
| T-02-15 Repudiation (abort not documented) | Mitigated — probe date, URL, and finding in trakstar.ts header |

## Known Stubs

None — `fetchAllTrakstarJobs` returning `[]` is the correct abort behavior, not a placeholder.

## Self-Check: PASSED

- `packages/ats-adapters/src/trakstar.ts` exists: YES
- `packages/ats-adapters/test/trakstar.test.ts` exists: YES
- `grep -q "TrakstarAdapterError" packages/ats-adapters/src/trakstar.ts`: YES
- `grep -q "fetchAllTrakstarJobs" workers/ingest/src/ingest.ts`: YES
- Commit e894173 exists: YES (feat)
- Commit ddf6d80 exists: YES (test)
- `pnpm vitest run`: 116/116 pass
- `pnpm tsc --noEmit`: clean
