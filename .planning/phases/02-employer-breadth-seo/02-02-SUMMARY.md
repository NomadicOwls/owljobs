---
phase: 02-employer-breadth-seo
plan: "02"
subsystem: frontend/seo
tags: [json-ld, structured-data, seo, google-for-jobs, tdd]
dependency_graph:
  requires: []
  provides: [SEO-01]
  affects: [apps/web/src/pages/jobs/[slug].astro]
tech_stack:
  added: []
  patterns: [JSON-LD JobPosting, conditional structured data, Math.max future-date guard]
key_files:
  created: []
  modified:
    - apps/web/src/pages/jobs/[slug].astro
    - apps/web/test/jobs.test.ts
decisions:
  - "Inlined 30* and 7* ms literals inside Math.max call to satisfy test regex pattern (Rule 1)"
  - "Used \\\\u003c escaped string (not unicode escape) to prevent XSS via </script> injection (T-02-04)"
  - "Added is:inline directive to Astro script tag to silence code-4000 hint from astro-check"
  - "Input.astro ts2322 pre-existing error scoped out — not introduced by this plan"
metrics:
  duration: "~8 minutes"
  completed: "2026-05-10"
  tasks_completed: 2
  files_modified: 2
---

# Phase 2 Plan 02: JSON-LD JobPosting Structured Data Summary

One-liner: Conditional `<script type="application/ld+json">` JobPosting block on job detail pages, gated on description, non-aggregator source, and non-expired status, using Math.max future-date guard for validThrough.

## What Was Built

Added Google JobPosting structured data to `apps/web/src/pages/jobs/[slug].astro` following D-15 through D-18 and research Pitfalls 4 and 9. Eight new TDD source-contract tests were written first (RED), then the implementation made them pass (GREEN).

## JSON-LD Field Mapping

| DB Column / Derived | schema.org Property | Notes |
|---|---|---|
| `job.title` | `title` | Required D-18 |
| `job.description` | `description` | Required D-18; null guard (D-15) |
| `job.posted_at` | `datePosted` | ISO date (YYYY-MM-DD) |
| `Math.max(posted+30d, now+7d)` | `validThrough` | Always future (Pitfall 9) |
| `job.employers.name` | `hiringOrganization.name` | Required D-18 |
| `canonicalUrl` | `url` | Required D-18 |
| `job.location` | `jobLocation.address.addressLocality` | Omitted when null (D-16) |
| `job.country` | `jobLocation.address.addressCountry` | Omitted when null |

## Emission Guards

| Condition | Guard | Disposition |
|---|---|---|
| `description IS NULL` | `!!job.description` | Skip JSON-LD (D-15) |
| `source IN ('adzuna','jsearch')` | `aggregatorSources.has(s.source)` | Skip JSON-LD (Pitfall 4) |
| `status = 'expired'` | `!isExpired` | Skip JSON-LD (existing 410 branch, Pitfall 8) |

## Test Results

```
Tests  14 passed (14)
  - lib/jobs.ts — DATA-02 status='active' filter: 6 passed (existing, no regression)
  - [slug].astro — JSON-LD JobPosting structured data (SEO-01, D-15..D-18): 8 passed (new)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Inlined ms literals inside Math.max to satisfy test regex**
- **Found during:** Task 2 (pre-analysis via advisor)
- **Issue:** Plan snippet used `const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000` then `Date.now() + SEVEN_DAYS_MS`, placing `7 *` outside the Math.max call. Test 5 regex `Math\.max\s*\([\s\S]*?Date\.now\(\)\s*\+\s*[\s\S]*?7\s*\*` requires `7 *` to appear after `Date.now() +` inside the call.
- **Fix:** Inlined literals as `Math.max(postedAtMs + 30 * 24 * 60 * 60 * 1000, Date.now() + 7 * 24 * 60 * 60 * 1000)` — dropped THIRTY_DAYS_MS/SEVEN_DAYS_MS constants.
- **Files modified:** `apps/web/src/pages/jobs/[slug].astro`
- **Commit:** 24b74d5

**2. [Rule 1 - Bug] Fixed XSS escape string literal — "<" vs "\\u003c"**
- **Found during:** Task 2 (pre-analysis via advisor)
- **Issue:** Plan snippet used `.replace(/</g, "<")`. JavaScript evaluates `"<"` at parse time to the single character `<`, making the replacement a no-op. The T-02-04 XSS mitigation would be completely ineffective.
- **Fix:** Used `"\\u003c"` so the replacement string is the literal six-character Unicode escape sequence.
- **Files modified:** `apps/web/src/pages/jobs/[slug].astro`
- **Commit:** 24b74d5

**3. [Rule 3 - Blocking] Added is:inline to silence Astro code-4000 error**
- **Found during:** Task 2 typecheck
- **Issue:** Astro's `astro-check` treats the `type` + `set:html` attributed script tag as code-4000 (error-level in astro-check output).
- **Fix:** Added `is:inline` directive explicitly — this is the recommended resolution per Astro docs and does not change runtime behavior.
- **Files modified:** `apps/web/src/pages/jobs/[slug].astro`
- **Commit:** 24b74d5

### Out-of-Scope Issues Noted

- `Input.astro` ts(2322): pre-existing since initial commit — not introduced here, not fixed (out of scope per deviation rules).
- `worker-ingest` TS2305 `reclassifyAmbiguous`: pre-existing — not introduced here.

## Threat Model Coverage

| Threat ID | Status |
|---|---|
| T-02-04 (JSON-LD `</script>` XSS) | Mitigated — `.replace(/</g, "\\u003c")` applied correctly after advisor fix |
| T-02-05 (description disclosure) | Accepted — description already public on page |
| T-02-06 (false structured data) | Mitigated — D-15, Pitfall 4, D-16 guards enforced |

## Known Stubs

None — all guards and fields are wired to real DB data.

## Manual Verification (Post-Deploy)

- Open an enriched job detail page in dev, view source: `<script is:inline type="application/ld+json">` present in body.
- For a job with `description=null`: no JSON-LD in source.
- Post-deploy: paste production URL into https://search.google.com/test/rich-results — should report eligible for "Job posting" rich result.

## Self-Check

- [x] `apps/web/test/jobs.test.ts` modified — 54 lines added, new describe block present
- [x] `apps/web/src/pages/jobs/[slug].astro` modified — 53 lines added, `application/ld+json` present
- [x] Commit `c6960ca` exists (test RED)
- [x] Commit `24b74d5` exists (feat GREEN)
- [x] 14/14 tests pass
- [x] Pre-existing typecheck errors not introduced by this plan
