---
phase: 02-employer-breadth-seo
plan: "05"
subsystem: ats-adapters, ingest-pipeline, niche-config
tags: [smartrecruiters, ats-adapter, lazy-fetch, covg-02, d-09, pitfall-3]
dependency_graph:
  requires: [02-04]
  provides: [SmartRecruiters-adapter, ingestSmartRecruiters, smartrecruiters-niche-targets]
  affects:
    - packages/ats-adapters/src/smartrecruiters.ts
    - packages/ats-adapters/package.json
    - packages/ats-adapters/test/smartrecruiters.test.ts
    - workers/ingest/src/ingest.ts
    - niches/wind-turbine.ts
tech_stack:
  added: []
  patterns: [lazy-fetch-adapter, source-contract-tests, offset+limit-pagination, MAX_RECORDS-guard]
key_files:
  created:
    - packages/ats-adapters/src/smartrecruiters.ts
    - packages/ats-adapters/test/smartrecruiters.test.ts
  modified:
    - packages/ats-adapters/package.json
    - workers/ingest/src/ingest.ts
    - niches/wind-turbine.ts
decisions:
  - "AdaptedJob defined locally in smartrecruiters.ts (not imported from workday.ts) — postedOn: string | null suits SmartRecruiters releasedDate which can be absent"
  - "companyId stored in ats_site via upsertEmployer — fetch-description.ts (Plan 04) reads it for detail-endpoint calls"
  - "JobInput.source union extended with 'smartrecruiters' | 'trakstar' together to prevent Plan 07 churn commit"
  - "Employers not live-verified: BoschRexroth and Enercon added with disclaimer comments; verification deferred to Plan 08 discovery or production ingest logs"
metrics:
  duration: "~15 minutes"
  completed: "2026-05-11"
  tasks_completed: 4
  files_modified: 5
---

# Phase 02 Plan 05: SmartRecruiters Adapter Summary

One-liner: Built lazy-fetch SmartRecruiters list adapter with offset+limit pagination, wired real ingestSmartRecruiters replacing the Plan 04 stub, and added 2 SmartRecruiters wind employers (Bosch Rexroth, Enercon) to the niche config.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Wave 0 — smartrecruiters.test.ts RED | 893afa6 | packages/ats-adapters/test/smartrecruiters.test.ts |
| 2 | Build SmartRecruiters list adapter GREEN | 4893a1e | packages/ats-adapters/src/smartrecruiters.ts, packages/ats-adapters/package.json |
| 3 | Replace stub with real ingestSmartRecruiters | dde358d | workers/ingest/src/ingest.ts |
| 4 | Add 2 SmartRecruiters wind employers | f68f26c | niches/wind-turbine.ts |

## Adapter API Contract

**Endpoint:** `GET https://api.smartrecruiters.com/v1/companies/{companyId}/postings?status=PUBLIC&limit=100&offset=N`

**Auth:** None required (public endpoint).

**Pagination behavior:**
- `PAGE_SIZE = 100`, `MAX_RECORDS = 1000` guard (T-02-15 mitigation)
- Loops via `offset += PAGE_SIZE` until `offset >= totalFound` or `content.length === 0`
- Max 10 pages per run (1000 records) — prevents runaway pagination

**AdaptedJob fields:**
- `title` ← `posting.name`
- `location` ← `buildLocation(posting.location)` → "City, Region, Country" or "Remote"
- `postedOn` ← `posting.releasedDate ?? null`
- `canonicalUrl` ← `https://jobs.smartrecruiters.com/{companyId}/{posting.id}`
- `sourceId` ← `sha256Hex(canonicalUrl)`
- `description` ← **always `null`** (Pitfall 3 — lazy fetch in enrich stage via fetch-description.ts)

## ingestSmartRecruiters Behavior

- Calls `fetchAllSmartRecruitersJobs(target)` — throws `SmartRecruitersAdapterError` on HTTP error
- `upsertEmployer` with `atsSite: target.companyId` (fetch-description.ts reads `ats_site` to build detail endpoint URL)
- Per-job: `upsertJob` with `source: "smartrecruiters"`, creation ping on insert via `buildPublicUrl` + budget guard
- `expireMissingJobs` called at end (SmartRecruiters returns full company snapshot — unlike aggregators)

## SmartRecruiters Tenants Added

| Employer | companyId | Verification | Notes |
|----------|-----------|-------------|-------|
| Bosch Rexroth | BoschRexroth | Deferred — no live probe | Wind pitch control + hydraulic systems division |
| Enercon | Enercon | Deferred — no live probe | Major German wind OEM, 5th largest globally |

**Verification note:** Live curl probing was prohibited by the orchestrator constraint (no live HTTP requests during implementation). Both companyIds are based on standard SmartRecruiters URL patterns (jobs.smartrecruiters.com/{companyId}). Actual validation will occur at first production ingest run or via Plan 08 auto-discovery results. If either returns 404, the companyId may need adjustment (e.g. "bosch-rexroth" or "ENERCON").

## Cumulative Employer Count

| Wave | Employers | ATS | Status |
|------|-----------|-----|--------|
| Wave 0 | GE Vernova, Vestas, NextEra Energy | Workday, SF | Active |
| Wave 1 | Nordex, Blattner Energy, Invenergy, Avangrid Renewables, Global Wind Service, Deutsche Windtechnik | SF, Workday×3, Recruitee, Softgarden | Active |
| Wave 2 | Bosch Rexroth, Enercon | SmartRecruiters×2 | Added (verification pending) |

Total native ATS targets: **11** (3 Wave 0 + 6 Wave 1 + 2 Wave 2). Path to 20+: Plans 06 (Adzuna/JSearch aggregators) + Plan 07 (Trakstar) + Plan 08 discovery.

## Test Results

```
Test Files  13 passed (13)
     Tests  95 passed (95)
```

Source-contract tests in `packages/ats-adapters/test/smartrecruiters.test.ts`:
1. exports fetchAllSmartRecruitersJobs — PASS
2. exports SmartRecruitersAdapterError class — PASS
3. calls the public Postings list endpoint with status=PUBLIC — PASS
4. paginates via offset + limit — PASS
5. sets description: null for all returned jobs (Pitfall 3) — PASS
6. returns AdaptedJob shape (title, canonicalUrl, sourceId) — PASS
7. imports sha256Hex from @owljobs/schema — PASS
8. does NOT include detail-endpoint fetch in list adapter (lazy) — PASS

## Deviations from Plan

### Live Probe Constraint (Rule 3 — Blocking)

**Found during:** Task 4

**Issue:** Plan Task 4 directs: "executor MUST verify the API responds 200 OK before committing the entry via `curl -sI`". The orchestrator's sequential_execution block prohibits all live HTTP requests during implementation (prior run stalled 600+ seconds).

**Fix:** Added 2 SmartRecruiters employers (BoschRexroth, Enercon) from plan's candidate list and market knowledge, with inline code comments clearly marking them as verification-deferred. Documented in SUMMARY.

**Impact:** Two employers may require companyId adjustment at first production ingest. The ingest function handles this gracefully via `SmartRecruitersAdapterError` warning log.

### JobInput.source Extended with "trakstar" (Rule 2 — Preemptive)

**Found during:** Task 3

**Issue:** Plan noted adding only "smartrecruiters" to `JobInput.source`, but Plan 07 (Trakstar) will need "trakstar" and a separate churn commit.

**Fix:** Added both "smartrecruiters" and "trakstar" to `JobInput.source` union in a single commit (matching the plan's Step A guidance and the advisor's recommendation).

**Commit:** dde358d

## Threat Surface Scan

No new security-relevant surface introduced beyond what is in the plan's threat model:
- T-02-13: Malformed JSON — handled by type assertion + per-job try/catch in ingestSmartRecruiters
- T-02-15: Pagination runaway — MAX_RECORDS=1000 guard enforced in adapter

## Self-Check: PASSED

- [x] packages/ats-adapters/src/smartrecruiters.ts exists with fetchAllSmartRecruitersJobs + SmartRecruitersAdapterError
- [x] packages/ats-adapters/test/smartrecruiters.test.ts exists; 8/8 tests pass
- [x] packages/ats-adapters/package.json has ./smartrecruiters export entry
- [x] workers/ingest/src/ingest.ts has ingestSmartRecruiters function; stub removed; atsSite=companyId; expireMissingJobs called
- [x] niches/wind-turbine.ts has 2 SmartRecruiters targets + Wave 2 section header
- [x] Commits 893afa6, 4893a1e, dde358d, f68f26c all in git log
- [x] pnpm tsc --noEmit passes for workers/ingest and packages/ats-adapters
- [x] 95/95 tests pass across full suite (13 test files)
