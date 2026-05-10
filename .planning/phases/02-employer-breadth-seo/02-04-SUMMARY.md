---
phase: 02-employer-breadth-seo
plan: "04"
subsystem: ingest-pipeline
tags: [ats-types, type-unions, fetch-description, smartrecruiters, source-contract-tests]
dependency_graph:
  requires: [02-03]
  provides: [AtsTarget-union-9-members, fetch-description-tracked, SmartRecruiters-description-branch, EmployerInput-atsType-extended]
  affects: [workers/ingest/src/ingest.ts, workers/ingest/src/fetch-description.ts, packages/niches/src/index.ts, workers/ingest/src/classify.ts]
tech_stack:
  added: []
  patterns: [source-contract-tests, exhaustive-union-check, lazy-import-for-sanitize, ats_site-as-companyId-store]
key_files:
  created:
    - workers/ingest/test/fetch-description.test.ts
  modified:
    - packages/niches/src/index.ts
    - workers/ingest/src/ingest.ts
    - workers/ingest/src/fetch-description.ts
    - workers/ingest/src/classify.ts
decisions:
  - "fetch-description.ts was untracked — staged and committed; fresh-clone build no longer breaks (Pitfall 6)"
  - "EmployerInput.atsType union and AtsTarget union extended together in one wave — prevents cascading TS errors if added piecemeal"
  - "classify.ts LLM reclassify pre-work bundled into Tasks 1+4 commit — was already a staged uncommitted change"
  - "Task 1 git add deferred to same commit as Task 4 (plan instruction) — fetch-description.ts landed in commit 8d71498 because it was already staged when Task 2 committed"
metrics:
  duration: "~12 minutes"
  completed: "2026-05-11"
  tasks_completed: 5
  files_modified: 4
---

# Phase 02 Plan 04: AtsTarget Union Extension + fetch-description SmartRecruiters Branch Summary

One-liner: Extended AtsTarget to 9 members, committed untracked fetch-description.ts, added SmartRecruiters detail-endpoint branch with sanitization, and added source-contract test suite.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Stage fetch-description.ts | 8d71498 (bundled with T2) | workers/ingest/src/fetch-description.ts |
| 2 | Extend AtsTarget union | 8d71498 | packages/niches/src/index.ts |
| 3 | Add stub branches + EmployerInput.atsType | 02d18fd | workers/ingest/src/ingest.ts |
| 4 | SmartRecruiters branch in fetch-description.ts | 98be814 | workers/ingest/src/fetch-description.ts, workers/ingest/src/classify.ts |
| 5 | fetch-description.test.ts source-contract tests | bcb87ac | workers/ingest/test/fetch-description.test.ts |

## Files Modified

### packages/niches/src/index.ts
- Added 4 new interfaces: `SmartRecruitersTarget`, `TrakstarTarget`, `AdzunaTarget`, `JSearchTarget`
- Extended `AtsTarget` union from 5 to 9 members

### workers/ingest/src/ingest.ts
- Extended `EmployerInput.atsType` from 6 to 10 values (added smartrecruiters, trakstar, adzuna, jsearch)
- Added 4 stub `else if` branches in `ingestNiche` (log-only, no DB writes)
- Added `_exhaustive: never` exhaustiveness guard at end of chain

### workers/ingest/src/fetch-description.ts
- Was untracked — now committed (Pitfall 6 resolved)
- Added SmartRecruiters branch: hits `api.smartrecruiters.com/v1/companies/{id}/postings/{id}`
- Extracts `companyId` from `ats_site`, `postingId` from `canonical_url` regex match
- Merges `jobDescription`, `qualifications`, `additionalInformation` sections
- Sanitizes with `sanitizeJobDescription` via lazy dynamic import (T-02-10 mitigation)
- Returns null on fetch failure, missing `ats_site`, or empty sections

### workers/ingest/src/classify.ts
- Pre-work: added `ReclassifyStats` interface, `reclassifyAmbiguous` export
- Added LLM arbiter helpers (`llmYesNo`, `buildLlmText`, `buildEmbedText`)
- Updated `classifyPendingJobs` to use LLM for ambiguous cosine scores (AMBIGUOUS_FLOOR..POSITIVE_THRESHOLD band)
- Added `fetchDescription` import (makes the import graph consistent with enrich.ts)

## Type Union: AtsTarget (9 members)

| Interface | atsType | Key Field | Notes |
|-----------|---------|-----------|-------|
| WorkdayTarget | workday | tenant, instance, site | Pre-existing |
| SuccessFactorsTarget | successfactors | careersBaseUrl | Pre-existing |
| GreenhouseTarget | greenhouse | boardToken | Pre-existing |
| RecruiteeTarget | recruitee | companySlug | Pre-existing |
| SoftgardenTarget | softgarden | feedUrl | Pre-existing |
| SmartRecruitersTarget | smartrecruiters | companyId | New — Plan 05 wires adapter |
| TrakstarTarget | trakstar | companySlug | New — Plan 07 wires adapter |
| AdzunaTarget | adzuna | country | New — Plan 06 wires adapter |
| JSearchTarget | jsearch | (none extra) | New — Plan 06 wires adapter |

## fetch-description.ts Routing Table

| ats_type | Handler | Approach |
|----------|---------|----------|
| workday | fetchWorkdayJobDescription | Workday CXS API, externalPath from canonical_url |
| successfactors | fetchSuccessFactorsJobDescription | Delegated to ats-adapters |
| recruitee | fetchRecruiteeJobDescription | Delegated to ats-adapters |
| smartrecruiters | Inline fetch | Detail endpoint: api.smartrecruiters.com/v1/companies/{companyId}/postings/{postingId} |
| greenhouse | null (fallthrough) | Descriptions set eagerly at ingest from API response |
| softgarden | null (fallthrough) | Descriptions set eagerly at ingest from API response |

## Test Results

```
Test Files  7 passed (7)
     Tests  40 passed (40)  (+7 new from fetch-description.test.ts)
```

Source-contract tests in `workers/ingest/test/fetch-description.test.ts`:
1. file tracked in git (Pitfall 6)
2. workday routing to fetchWorkdayJobDescription
3. successfactors routing to fetchSuccessFactorsJobDescription
4. recruitee routing to fetchRecruiteeJobDescription
5. smartrecruiters routing to detail endpoint (Pitfall 3)
6. SmartRecruiters branch applies sanitizeJobDescription
7. null fallthrough for greenhouse/softgarden

## Deviations from Plan

### Commit choreography deviation

Task 1 was a `git add` without a commit (plan instruction: "do NOT create a commit yet — Tasks 2-5 modify the file further"). When Task 2 committed `packages/niches/src/index.ts`, `fetch-description.ts` was already staged and landed in commit `8d71498`. Net result is identical to the plan's goal: file is tracked in git from this plan. The 4-commit sequence matches the advisor's suggestion.

### classify.ts pre-work bundled into Task 4 commit

`workers/ingest/src/classify.ts` had uncommitted changes (LLM reclassify pre-work) that were in scope per the system prompt. Bundled into the Task 4 commit alongside `fetch-description.ts` modifications. This was not a separate plan task but was declared in-scope pre-work.

## Threat Surface Scan

| Flag | File | Description |
|------|------|-------------|
| threat_flag: outbound-fetch | workers/ingest/src/fetch-description.ts | New outbound fetch to api.smartrecruiters.com — public endpoint, no auth. In threat model as T-02-10/T-02-11/T-02-12. |

## Known Stubs

| File | Line | Stub | Reason |
|------|------|------|--------|
| workers/ingest/src/ingest.ts | ~67-75 | smartrecruiters/trakstar/adzuna/jsearch stub branches | Intentional — Plans 05/06/07 wire real adapters. These exist solely for TS exhaustive-check. |

Stubs do not prevent plan goal (type union foundation + fetch-description SmartRecruiters branch). Future plans resolve them.

## Self-Check: PASSED

- [x] packages/niches/src/index.ts exists and has 4 new interfaces
- [x] workers/ingest/src/ingest.ts has 4 stub branches + _exhaustive: never
- [x] workers/ingest/src/fetch-description.ts tracked in git; has SmartRecruiters branch
- [x] workers/ingest/test/fetch-description.test.ts exists; 7/7 tests pass
- [x] Commits 8d71498, 02d18fd, 98be814, bcb87ac all exist in git log
- [x] pnpm tsc --noEmit passes (no output from workers/ingest tsc)
- [x] 40/40 tests pass across full ingest test suite
