---
phase: 02-employer-breadth-seo
verified: 2026-05-11T00:00:00Z
status: gaps_found
score: 1/5 must-haves verified
overrides_applied: 0
gaps:
  - truth: "A user browsing the site sees jobs from at least 20 distinct employers (target 50)"
    status: failed
    reason: >
      Only 9 employers are verified live (Wave 0: GE Vernova, Vestas, NextEra Energy + Wave 1:
      Nordex, Blattner Energy, Invenergy, Avangrid Renewables, Global Wind Service, Deutsche
      Windtechnik). Two SmartRecruiters tenants (BoschRexroth, Enercon) were added but both
      marked "live verification deferred — companyId unconfirmed." No production ingest run has
      occurred. The aggregator sentinels (Adzuna/JSearch) are not distinct named employers toward
      the 20-employer count; they are a coverage fallback. Requirement COVG-02 is unmet.
    artifacts:
      - path: "niches/wind-turbine.ts"
        issue: "Only 9 verified native employer targets. BoschRexroth and Enercon companyIds are unconfirmed by live probe."
      - path: "workers/ingest/src/ingest.ts"
        issue: "No production ingest run executed — no actual DB writes to wind_turbine.jobs."
    missing:
      - "Verify BoschRexroth and Enercon SmartRecruiters companyIds via live curl probe"
      - "Add more verified employers (minimum 9 more) to reach 20+ native ATS targets"
      - "Deploy workers/ingest with all required secrets and run initial ingest cron"
      - "Confirm actual employer row count in wind_turbine.jobs after first ingest"

  - truth: "The auto-discovery script reports a ranked list of new employer candidates with detected ATS platform and confidence score"
    status: failed
    reason: >
      The Discovery Worker (workers/discover) exists in code and all 16 probe.test.ts tests pass,
      but the worker has NOT been deployed to Cloudflare. The public.candidates table does not
      exist in production: migration 0005 was not applied because the Supabase CLI is linked to
      the wrong project (groepshuizen instead of owljobs) — confirmed in 02-01-SUMMARY.md.
      Required secrets (DISCOVER_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) are not set.
      No smoke-test has been run. The auto-discovery script cannot function. Requirement COVG-01
      is unmet.
    artifacts:
      - path: "workers/discover/src/index.ts"
        issue: "Worker code complete (16/16 tests pass) but NOT deployed to Cloudflare."
      - path: "packages/schema/src/migrations/0005_candidates.sql"
        issue: "Migration written but NOT applied to production Supabase. CLI linked to wrong project."
    missing:
      - "Re-link Supabase CLI to owljobs project (not groepshuizen)"
      - "Apply migration 0005 (public.candidates table) to production Supabase"
      - "Deploy workers/discover to Cloudflare with wrangler deploy"
      - "Set DISCOVER_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY as Worker secrets"
      - "Run smoke-test: POST /probe with a seed candidates row and verify probe result returned"

  - truth: "Job creation, expiry, and description updates ping the Google Indexing API and the URL appears in Search Console within 48 hours"
    status: failed
    reason: >
      Creation pings (ingest.ts) and description-update pings (enrich.ts) are correctly
      implemented using buildPublicUrl — they ping owljobs.com URLs. However, expiry pings
      (expire.ts:86) call pingUrlUpdated(saJson, job.canonical_url) where job.canonical_url is
      the employer's ATS URL. Google Indexing API only processes URLs registered in Search
      Console — all expiry pings are silently discarded. Expired jobs on windturbinejobs.com are
      never deindexed via the API. This is CR-02 from the code review, confirmed unfixed in the
      codebase. Requirement SEO-03 is partially met (2/3 ping scenarios correct, 1/3 broken).
    artifacts:
      - path: "workers/ingest/src/expire.ts"
        issue: "Line 86: pingUrlUpdated called with job.canonical_url (ATS URL) instead of buildPublicUrl(niche, job.id). Expiry deindex pings are silently discarded by Google."
    missing:
      - "Add niche: NicheConfig parameter to expireMissingJobs() in expire.ts"
      - "Replace pingUrlUpdated(saJson, job.canonical_url) with pingUrlUpdated(saJson, buildPublicUrl(niche, job.id)) at expire.ts:86"
      - "Update all 7 callers in ingest.ts to pass niche as the additional argument"

  - truth: "Every job detail page passes Google's Rich Results Test for JobPosting structured data"
    status: failed
    reason: >
      The JSON-LD guard at apps/web/src/pages/jobs/[slug].astro:67 uses
      (job.job_sources ?? []).some((s) => aggregatorSources.has(s.source)) to detect aggregators.
      This check fires true if ANY source row references Adzuna or JSearch — including native
      Workday/Greenhouse/SuccessFactors jobs that also appear in Adzuna search results. A
      Vestas job enriched with a full description will have isAggregator=true and lose its
      JSON-LD rich result, making it ineligible for Google for Jobs. This is WR-05 from the
      code review, confirmed present in the codebase. Additionally, Rich Results Test has not
      been run on any production job URL (post-deploy human verification step not completed).
      Requirement SEO-01 is partially met.
    artifacts:
      - path: "apps/web/src/pages/jobs/[slug].astro"
        issue: "Line 67: isAggregator checks job_sources rows (any aggregator source) instead of employers.ats_type. Native ATS jobs cross-listed on Adzuna lose JSON-LD incorrectly."
    missing:
      - "Fix isAggregator check: use employers.ats_type to distinguish native vs. aggregator employers"
      - "Fix: const isAggregator = [\"adzuna\", \"jsearch\"].includes(job.employers?.ats_type ?? \"\")"
      - "After deploy, verify at least one production job URL passes Google Rich Results Test"

  - truth: "Unauthenticated debug endpoints do not expose quota-burning operations"
    status: failed
    reason: >
      Four operational endpoints (/classify-now, /ingest-now, /reclassify-ambiguous, /enrich-now)
      in workers/ingest/src/index.ts have no authentication. Any HTTP client that knows the
      Worker URL can trigger Adzuna/JSearch API calls (paid quota), Workers AI inference costs,
      Google Indexing API pings (200/day budget), and Cloudflare Pages rebuilds. This was
      flagged as CR-01 (Critical) in the code review and is confirmed unfixed. With aggregator
      credentials (ADZUNA_APP_KEY, JSEARCH_API_KEY) set in production, anonymous callers can
      exhaust paid API quotas. This directly undermines the "credible" goal by potentially
      causing ingest failures from quota exhaustion.
    artifacts:
      - path: "workers/ingest/src/index.ts"
        issue: "fetch() handler has no Authorization check. /classify-now, /ingest-now, /reclassify-ambiguous, /enrich-now are unauthenticated. Contrast: workers/discover/src/index.ts:96-99 correctly gates on Bearer token."
    missing:
      - "Add INGEST_SECRET to Env interface in workers/ingest/src/index.ts"
      - "Add INGEST_SECRET to wrangler.toml secrets list"
      - "Add Bearer token check at top of fetch() handler before routing to debug endpoints"

human_verification:
  - test: "Google Rich Results Test on a production job URL"
    expected: "The test reports JobPosting structured data detected with no errors and no missing required fields. The job is eligible for Google for Jobs enriched display."
    why_human: "Requires a deployed production URL and a live Google API call that cannot be automated from the codebase."

  - test: "Confirm aggregator API credentials are set as Worker secrets in production"
    expected: "wrangler secret list --name owljobs-ingest lists ADZUNA_APP_ID, ADZUNA_APP_KEY, and JSEARCH_API_KEY as set secrets. Alternatively, a test ingest run logs no 'missing credentials' warnings."
    why_human: "Cloudflare Worker secrets are not stored in the repository. Cannot verify from codebase alone."

  - test: "Confirm 'Search Console URL appears within 48 hours' after a Google Indexing API ping"
    expected: "After deploying and triggering a job creation, the Google Search Console URL Inspection tool shows the job URL indexed within 48 hours."
    why_human: "Requires live production deployment and waiting for Google crawl — cannot verify from codebase."
---

# Phase 2: Employer Breadth & SEO Verification Report

**Phase Goal:** The site has enough employer coverage and Google for Jobs visibility to look credible to both candidates and (eventually) cold-pitched employers.
**Verified:** 2026-05-11
**Status:** GAPS FOUND
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

Five truths are derived from the ROADMAP success criteria for Phase 2.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A user browsing the site sees jobs from at least 20 distinct employers (target 50) | FAILED | 9 verified native employer targets in niches/wind-turbine.ts; 2 SmartRecruiters tenants unverified by live probe; no production ingest run; aggregators are not distinct employers |
| 2 | Every job detail page passes Google's Rich Results Test for JobPosting structured data | FAILED | WR-05 confirmed in [slug].astro:67 — native ATS jobs cross-listed on Adzuna lose JSON-LD; Rich Results Test not run on any production URL |
| 3 | Every relevant classified job displays a full enriched description (no stub-only listings) | VERIFIED | fetch-description.ts tracked; SmartRecruiters/Workday/SuccessFactors/Recruitee/Softgarden branches implemented; enrich.ts pings on description update; 40/40 tests pass |
| 4 | The auto-discovery script reports a ranked list of new employer candidates with detected ATS platform and confidence score | FAILED | workers/discover code complete (16/16 tests pass) but migration 0005 not applied to production; worker not deployed; DISCOVER_SECRET not set; smoke-test not run |
| 5 | Job creation, expiry, and description updates ping the Google Indexing API | FAILED | Creation pings (ingest.ts) and description pings (enrich.ts) use buildPublicUrl correctly; expiry pings (expire.ts:86) use job.canonical_url (ATS URL) — CR-02 confirmed unfixed |

**Score: 1/5 truths verified**

### Deferred Items

None. COVG-01 (migration 0005 + Discovery Worker deployment), COVG-02 (20 employer minimum), and the CR-01/CR-02/WR-05 bug fixes are not scheduled in any later phase (Phase 3-5 goals are candidates, employer product, and monetization). These are real gaps.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/web/src/pages/jobs/[slug].astro` | JSON-LD JobPosting with guards | STUB (partial) | JSON-LD implemented but isAggregator check fires on source rows not employer ats_type — WR-05 bug suppresses JSON-LD for native jobs cross-listed on Adzuna |
| `workers/ingest/src/expire.ts` | Ping owljobs.com URLs on job expiry | STUB (partial) | pingUrlUpdated called with job.canonical_url (ATS URL) instead of buildPublicUrl — CR-02 bug means expiry pings discarded by Google |
| `workers/ingest/src/index.ts` | Authenticated debug endpoints | MISSING (auth) | /classify-now, /ingest-now, /reclassify-ambiguous, /enrich-now have no Bearer token check — CR-01 confirmed |
| `workers/discover/src/index.ts` | Deployed Discovery Worker probing public.candidates | ORPHANED | Code complete (16/16 tests pass) but not deployed; migration 0005 not applied to production |
| `packages/schema/src/migrations/0005_candidates.sql` | public.candidates table in production | MISSING (applied) | Migration written but not applied — Supabase CLI linked to wrong project (groepshuizen) |
| `niches/wind-turbine.ts` | 20+ verified employer targets | STUB (count) | 9 verified + 2 unverified SmartRecruiters = 11 at most; aggregator sentinels not distinct employers |
| `workers/ingest/src/ingest.ts` | Aggregator branches without upsertEmployer/expireMissingJobs | VERIFIED | ensureAggregatorEmployer sentinel pattern; no-expire enforced; 111/111 tests pass |
| `workers/ingest/src/enrich.ts` | Description update pings using buildPublicUrl | VERIFIED | Pings owljobs.com URLs on description update; enrich.ts wired correctly |
| `packages/ats-adapters/src/trakstar.ts` | Trakstar adapter (abort documented) | VERIFIED | Documented abort stub with probe date/URL/finding; 5/5 contract tests pass |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `[slug].astro` | JSON-LD output | `shouldEmitJsonLd` flag | PARTIAL | isAggregator bug (WR-05) causes false-positive suppression for native ATS jobs |
| `expire.ts` | Google Indexing API | `pingUrlUpdated` | BROKEN | Pings job.canonical_url (ATS URL) not buildPublicUrl — all expiry pings silently discarded |
| `ingest.ts` | Google Indexing API | `pingUrlUpdated` + `buildPublicUrl` | VERIFIED | Creation pings use owljobs.com URLs; budget guard enforced (CREATION_PING_BUDGET=50) |
| `enrich.ts` | Google Indexing API | `pingUrlUpdated` + `buildPublicUrl` | VERIFIED | Description update pings use owljobs.com URLs |
| `workers/discover` | `public.candidates` | Supabase query | NOT_WIRED | Worker not deployed; table does not exist in production |
| `ingest.ts:adzuna` | `ensureAggregatorEmployer` | sentinel SHA-256 | VERIFIED | No upsertEmployer, no expireMissingJobs; 9/9 aggregator-no-expire.test.ts pass |
| `ingest.ts:jsearch` | `ensureAggregatorEmployer` | sentinel SHA-256 | VERIFIED | Same as Adzuna; consistent no-expire, no-upsertEmployer pattern |
| `fetch-description.ts` | SmartRecruiters detail endpoint | `ats_site` lookup | VERIFIED | Reads employer.ats_site (=companyId); SmartRecruiters branch implemented |
| `index.ts:fetch()` | debug endpoints | Bearer auth | MISSING | No auth guard on /classify-now, /ingest-now, /reclassify-ambiguous, /enrich-now |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `[slug].astro` | `job.description` | `wind_turbine.jobs.description` | Yes (via enrich.ts writes) | VERIFIED (when job has been enriched) |
| `[slug].astro` | `jsonLd` | `shouldEmitJsonLd` flag | Conditional — broken for cross-listed native jobs | HOLLOW (WR-05) |
| `workers/discover` | `candidates` rows | `public.candidates` table | No (table not in production) | DISCONNECTED |
| `ingest.ts` | job rows | ATS adapter responses | Yes (when ingest runs) | NOT_RUN (no production ingest) |

### Behavioral Spot-Checks

Step 7b: SKIPPED for deployed-runtime behaviors (no production deployment exists for workers/discover or workers/ingest). Code-level spot-checks were performed via source-contract test counts reported in summaries.

| Behavior | Evidence | Status |
|----------|----------|--------|
| trakstar.test.ts: 5/5 pass | 02-07-SUMMARY.md confirms | PASS |
| aggregator-no-expire.test.ts: 9/9 pass | 02-06-SUMMARY.md confirms | PASS |
| smartrecruiters.test.ts: 8/8 pass | 02-05-SUMMARY.md confirms | PASS |
| probe.test.ts: 16/16 pass | 02-08-SUMMARY.md confirms | PASS |
| Full suite: 116/116 pass | 02-07-SUMMARY.md (final state) | PASS |
| TypeScript clean (tsc --noEmit) | 02-07-SUMMARY.md confirms | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| COVG-01 | 02-01, 02-08 | ATS auto-discovery via workers/discover | BLOCKED | Code complete but not deployed; public.candidates table missing in production |
| COVG-02 | 02-01, 02-05, 02-07 | 20+ employers ingested | BLOCKED | 9 verified + 2 unverified = 11 at most; no production ingest run |
| COVG-03 | 02-06 | Adzuna aggregator fallback configured | UNCERTAIN | Adapter code + niche config verified; production secrets/ingest not confirmed |
| SEO-01 | 02-02 | JSON-LD JobPosting on all eligible job pages | PARTIAL | Code implemented but WR-05 bug suppresses JSON-LD for native ATS jobs cross-listed on Adzuna; Rich Results Test not run |
| SEO-02 | 02-04 | fetch-description.ts enrichment operational | VERIFIED | All branches implemented; 40/40 tests pass; enrich.ts pings on description update |
| SEO-03 | 02-03 | Google Indexing API pings on create/expire/update | PARTIAL | Creation and description pings correct; expiry pings use wrong URL (CR-02 unfixed) |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `workers/ingest/src/index.ts` | fetch() handler | No auth on /classify-now, /ingest-now, /reclassify-ambiguous, /enrich-now | BLOCKER | Any caller can burn paid Adzuna/JSearch quota and 200/day Google Indexing API budget |
| `workers/ingest/src/expire.ts` | 86 | `pingUrlUpdated(saJson, job.canonical_url)` uses ATS URL instead of buildPublicUrl | BLOCKER | All Google Indexing API expiry pings are silently discarded; expired jobs never deindexed |
| `apps/web/src/pages/jobs/[slug].astro` | 67 | `job_sources.some(s => aggregatorSources.has(s.source))` checks source rows not employer ats_type | BLOCKER | Native ATS jobs cross-listed on Adzuna lose JSON-LD rich results incorrectly |
| `packages/ats-adapters/src/trakstar.ts` | 38-40 | Multi-line console.warn fires on every cron run | WARNING | Log noise (IN-07 from review) |
| `packages/ats-adapters/src/trakstar.ts` | 21 | `export { AdaptedJob }` without `type` keyword | WARNING | Will fail under isolatedModules strict (IN-02 from review) |
| `packages/ats-adapters/src/smartrecruiters.ts` | 99 | companyId not URL-encoded in canonicalUrl | WARNING | Stored canonical URL may differ from actual page URL for companyIds with special chars (WR-07 from review) |
| `workers/ingest/src/classify.ts` | 249, 252 | Ternary used as statement for side effects | INFO | Style issue (IN-03 from review) |

### Human Verification Required

#### 1. Google Rich Results Test

**Test:** After deploying to production, take any job URL that has a non-null description and a non-Adzuna employer type, and paste it into https://search.google.com/test/rich-results
**Expected:** The test reports `JobPosting` structured data detected with no errors and no missing required fields. The job is eligible for Google for Jobs enriched display.
**Why human:** Requires a deployed production URL and a live call to Google's testing API that cannot be reproduced from the codebase.

#### 2. Aggregator API Credentials Set in Production

**Test:** Run `wrangler secret list --name owljobs-ingest` and confirm `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, and `JSEARCH_API_KEY` are listed as set secrets. Alternatively, trigger a manual ingest and check logs for "missing credentials" warnings.
**Expected:** All 3 aggregator secrets are set. No "missing credentials" warnings in the ingest logs.
**Why human:** Cloudflare Worker secrets are not stored in the repository and cannot be verified from codebase inspection.

#### 3. Search Console URL Indexing Confirmation

**Test:** After deploying workers/ingest and triggering a job creation event, check Google Search Console URL Inspection for the job's owljobs.com URL within 48 hours.
**Expected:** Google Search Console shows the URL as crawled and indexed. The URL inspection tool confirms it was submitted via Indexing API.
**Why human:** Requires live production deployment, waiting for Google crawl cycle, and Search Console access.

### Gaps Summary

**5 gaps block the phase goal. Root cause clusters into 3 concerns:**

**Concern A — Deployment (COVG-01, COVG-02):** Neither the Discovery Worker nor the ingest pipeline has been deployed and run in production. The public.candidates table does not exist in the Supabase production instance (migration 0005 not applied due to Supabase CLI linked to wrong project). Without a production ingest run, no employer count can be achieved, and the auto-discovery worker is unreachable. This is the most blocking concern — all other truths about "users browsing the site" and "discovery reports" depend on it.

**Concern B — Three confirmed code bugs (SEO-01, SEO-03, CR-01):**
1. **expire.ts:86** (CR-02): Expiry pings send ATS canonical URLs to Google Indexing API. Google silently discards them. Expired jobs are never deindexed.
2. **[slug].astro:67** (WR-05): JSON-LD is suppressed for native ATS jobs that also appear in Adzuna/JSearch results. A Vestas job with a full description loses its Google for Jobs eligibility.
3. **index.ts fetch() handler** (CR-01): No authentication on 4 operational debug endpoints. Anonymous callers can exhaust paid aggregator API quotas.

All three bugs are confirmed in the codebase and were flagged as Critical/Warning in 02-REVIEW.md. None were fixed during Phase 2 execution.

**Concern C — Employer count shortfall (COVG-02):** Even after fixing Concern A and deploying, the current niche config has at most 11 employer targets (9 verified + 2 unverified SmartRecruiters). The minimum is 20. Reaching 20 requires both verifying the existing SmartRecruiters tenants and adding at least 9 more verified employers.

---

_Verified: 2026-05-11_
_Verifier: Claude (gsd-verifier)_
