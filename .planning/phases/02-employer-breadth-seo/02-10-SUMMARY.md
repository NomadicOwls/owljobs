---
phase: 02-employer-breadth-seo
plan: 10
subsystem: seo
tags: [seo, json-ld, bug-fix, tdd, wr-05]
dependency_graph:
  requires: []
  provides: [SEO-01 gap closure WR-05]
  affects: [apps/web/src/pages/jobs/[slug].astro]
tech_stack:
  added: []
  patterns: [tdd-source-contract-test]
key_files:
  created: []
  modified:
    - apps/web/src/pages/jobs/[slug].astro
    - apps/web/test/jobs.test.ts
decisions:
  - isAggregator determined by employers.ats_type, not job_sources rows — source rows record provenance, not origin
metrics:
  duration: ~10 minutes
  completed: 2026-05-11
---

# Phase 2 Plan 10: WR-05 isAggregator Fix Summary

Fix SEO-01 gap WR-05: native ATS jobs cross-listed on Adzuna now correctly emit JSON-LD JobPosting structured data by checking `employers.ats_type` instead of `job_sources` rows.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add WR-05 failing test (RED) | 7d72481 | apps/web/test/jobs.test.ts |
| 2 | Fix isAggregator check (GREEN) | 9eb9d45 | apps/web/src/pages/jobs/[slug].astro |

## What Was Built

- **`[slug].astro`**: Replaced 2-line `aggregatorSources` Set + `job_sources.some()` check with a single `["adzuna", "jsearch"].includes(job.employers?.ats_type ?? "")` expression. Updated SEO-01 comment block to document WR-05 fix rationale.
- **`jobs.test.ts`**: Added 8th test in `[slug].astro` describe block asserting: old `job_sources` pattern absent, new `employers?.ats_type` pattern present, `aggregatorSources` Set absent. All 15 tests pass.

## WR-05 Closure Confirmation

- `job.employers?.ats_type` is the authoritative aggregator signal
- Vestas (ats_type="successfactors") cross-listed on Adzuna: `isAggregator=false` → JSON-LD emitted
- Pure Adzuna job (ats_type="adzuna"): `isAggregator=true` → JSON-LD suppressed
- `aggregatorSources` Set removed from `[slug].astro`

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None. No new network endpoints or auth paths introduced. `employers.ats_type` read via existing service-role Supabase query; disposition accepted per plan threat register (T-02-gap10-01).

## Human Verification Pending

Post-deploy: paste a native ATS job URL (e.g., a Vestas SuccessFactors job) into https://search.google.com/test/rich-results and confirm JobPosting structured data is detected with no errors. A pure Adzuna job should return no structured data.

## Self-Check: PASSED

- `apps/web/test/jobs.test.ts` exists and contains new WR-05 it() block
- `apps/web/src/pages/jobs/[slug].astro` contains `job.employers?.ats_type` and lacks `aggregatorSources`
- Commits 7d72481 and 9eb9d45 exist in git log
- All 15 tests pass; tsc clean
