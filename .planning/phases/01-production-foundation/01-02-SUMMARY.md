---
plan: 01-02
phase: 01-production-foundation
status: complete
requirements_satisfied:
  - DATA-02
self_check: PASSED
---

# Plan 01-02 Summary — Frontend 410 Handling

## What Was Built

Closed DATA-02 (expired jobs return 410, removed from sitemap/RSS/listings):

- **`apps/web/src/lib/jobs.ts`**: Added `.eq("status", "active")` filter to all 6 list/stat query sites — `listJobs`, `listEmployerJobs`, `listFeedJobs`, `listSitemapJobs`, `getStats.activeJobs`, `getStats.newThisWeek`. `getJobBySlug` intentionally NOT filtered so `[slug].astro` can return 410 for expired rows.
- **`apps/web/src/pages/jobs/[slug].astro`**: Added 410 branch — when `job.status === "expired"`, sets `Astro.response.status = 410` with short-cache headers (max-age=300, no SWR), renders a "no longer available" page that links back to `/jobs`.
- **`apps/web/test/jobs.test.ts`**: Contract tests verifying the status filter is present in list/stat queries and absent from `getJobBySlug`.

## Key Decisions / Deviations

- **Cache override for 410**: Per RESEARCH Pitfall 6, used `setCacheHeaders(headers, 300, 0)` instead of the default 600s/3600s to prevent CDN cache poisoning that would let stale 200 OK lag the 410 transition by up to an hour after Indexing API ping.
- **`JobSource` type annotation on `job.job_sources.map`**: Pre-existing TypeScript inference gap in the Astro template required `(s: JobSource)` annotation. Added `import type { JobSource } from "@owljobs/schema"` to fix.
- **`ui/Input.astro` ts(2322)**: Pre-existing typecheck error from initial commit — not introduced by this plan, not in scope.

## Self-Check

- [x] `lib/jobs.ts` — `.eq("status", "active")` present in all 6 query sites
- [x] `getJobBySlug` — no status filter (returns expired rows for 410 branch)
- [x] `[slug].astro` — `Astro.response.status = 410` present
- [x] `[slug].astro` — short-cache headers applied on 410 path
- [x] 410 page links back to `/jobs`
- [x] Tests committed

## Key Files

- `apps/web/src/lib/jobs.ts` — 6 status filters added
- `apps/web/src/pages/jobs/[slug].astro` — 410 branch + UI
- `apps/web/test/jobs.test.ts` — contract tests
