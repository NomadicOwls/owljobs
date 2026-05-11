---
phase: 02-employer-breadth-seo
plan: "09"
subsystem: workers/ingest
tags: [seo, indexing-api, bug-fix, refactor, tdd]
dependency_graph:
  requires: []
  provides: [SEO-03-expiry, WR-06]
  affects: [workers/ingest/src/expire.ts, workers/ingest/src/ingest.ts, workers/ingest/src/enrich.ts]
tech_stack:
  added: []
  patterns: [source-contract-test, shared-helper-extraction]
key_files:
  created:
    - workers/ingest/src/build-public-url.ts
    - workers/ingest/test/expiry-ping.test.ts
  modified:
    - workers/ingest/src/expire.ts
    - workers/ingest/src/ingest.ts
    - workers/ingest/src/enrich.ts
    - workers/ingest/test/expire.test.ts
    - workers/ingest/test/creation-ping.test.ts
decisions:
  - buildPublicUrl extracted to single shared module (not added inline to expire.ts as a third copy)
  - niche parameter added as required (not optional) — all 7 callers already had niche in scope
  - canonical_url kept in DB select — only the ping call target changed, not the data model
metrics:
  duration: "~15 minutes"
  completed: "2026-05-11"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 5
---

# Phase 2 Plan 09: Expiry Ping Fix (CR-02 / SEO-03 / WR-06) Summary

**One-liner:** Fix CR-02 by replacing `job.canonical_url` with `buildPublicUrl(niche, job.id)` in expiry pings; extract `buildPublicUrl` to a shared module eliminating three-way duplication.

## What Was Built

CR-02 identified that `expire.ts:86` was calling `pingUrlUpdated(saJson, job.canonical_url)` — sending employer ATS URLs to the Google Indexing API. ATS URLs are not registered in Search Console, so Google silently discards these pings. Expired wind turbine jobs were never being deindexed.

Fix: changed the ping call to `buildPublicUrl(niche, job.id)` (owljobs.com public URL). This required adding `niche: NicheConfig` as a required 5th parameter to `expireMissingJobs`.

WR-06 was resolved simultaneously: `buildPublicUrl` was duplicated in both `ingest.ts` and `enrich.ts`. Rather than adding a third copy to `expire.ts`, the helper was extracted to `workers/ingest/src/build-public-url.ts` and all three files now import from the shared module.

## Files

| File | Action | Description |
|------|--------|-------------|
| `workers/ingest/src/build-public-url.ts` | created | Shared buildPublicUrl helper — single source of truth (WR-06) |
| `workers/ingest/src/expire.ts` | modified | Add niche param; ping uses buildPublicUrl(niche, job.id) |
| `workers/ingest/src/ingest.ts` | modified | Import from shared module; pass niche to all 7 call sites |
| `workers/ingest/src/enrich.ts` | modified | Import from shared module; remove local def |
| `workers/ingest/test/expiry-ping.test.ts` | created | Source-contract test asserting CR-02 / WR-06 fix (7 tests) |
| `workers/ingest/test/expire.test.ts` | modified | Pass niche to all expireMissingJobs calls (Rule 3 fix) |
| `workers/ingest/test/creation-ping.test.ts` | modified | Point helper assertions at shared module (Rule 3 fix) |

## Test Results

- `pnpm vitest run workers/ingest/test/expiry-ping.test.ts` — 7/7 pass
- `pnpm vitest run workers/ingest/test/` — 64/64 pass (no regressions)
- `pnpm tsc --noEmit` — clean

## TDD Gate Compliance

- RED commit: `6af6213` — `test(02-09): add failing expiry-ping source-contract test (RED)` — 7 tests fail
- GREEN commit: `686cce3` — `feat(02-09): extract buildPublicUrl and fix expiry pings (CR-02, WR-06)` — 64 tests pass

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] creation-ping.test.ts regressed after WR-06 extraction**
- **Found during:** Task 2 — full test suite run
- **Issue:** `creation-ping.test.ts` asserted `ingest.ts` defines `buildPublicUrl` as a local function and that `niche.domain` appears near the first `buildPublicUrl` reference. After WR-06 extraction, ingest.ts only imports (no local def), breaking both assertions.
- **Fix:** Updated `creation-ping.test.ts` to load `build-public-url.ts` and check the canonical definition there; updated "defines a buildPublicUrl helper" assertion to confirm import from shared module instead.
- **Files modified:** `workers/ingest/test/creation-ping.test.ts`
- **Commit:** 686cce3

**2. [Rule 3 - Blocking] expire.test.ts failed due to updated expireMissingJobs signature**
- **Found during:** Task 2 — full test suite run
- **Issue:** `expire.test.ts` called `expireMissingJobs` without the new `niche` parameter, causing 3 test failures.
- **Fix:** Added `testNiche: NicheConfig` constant; passed it to all 6 `expireMissingJobs` calls in the test file.
- **Files modified:** `workers/ingest/test/expire.test.ts`
- **Commit:** 686cce3

## CR-02 and WR-06 Closure Confirmation

- **CR-02 (SEO-03 gap):** CLOSED. `expire.ts` ping call now uses `buildPublicUrl(niche, job.id)` — owljobs.com URLs. Google Indexing API deindexing for expired jobs will now work correctly.
- **WR-06:** CLOSED. `buildPublicUrl` defined in exactly one place (`build-public-url.ts`). All three consumers (ingest.ts, enrich.ts, expire.ts) import from the shared module.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. The ping URL target change (ATS URL → owljobs.com URL) is within the existing trust boundary documented in the plan's threat model (T-02-gap09-01 mitigated).

## Self-Check: PASSED

- `workers/ingest/src/build-public-url.ts` — FOUND
- `workers/ingest/test/expiry-ping.test.ts` — FOUND
- RED commit `6af6213` — FOUND
- GREEN commit `686cce3` — FOUND
- 64 tests pass, tsc clean
