# Phase 2: Employer Breadth & SEO — Research

**Researched:** 2026-05-10
**Domain:** Cloudflare Workers, ATS adapters, aggregator APIs, Google JobPosting JSON-LD, Google Indexing API
**Confidence:** HIGH (core decisions verified; Trakstar LOW)

---

## Summary

Phase 2 has two parallel tracks: (1) **ingest breadth** — activate 6 Wave 1 employers, build SmartRecruiters and Trakstar adapters, integrate Adzuna+JSearch aggregators, and create an auto-discovery Worker that probes employer career pages; and (2) **SEO surface** — add `JobPosting` JSON-LD to all enriched job detail pages and extend the Google Indexing API to fire on job creation and description update.

All decisions are locked in CONTEXT.md. Research focus is on verifying external API shapes, surfacing codebase-specific pitfalls that the CONTEXT.md does not address, and producing correct code examples for the planner.

The largest non-obvious risk is the **Indexing API 200-call/day quota**: Wave 1 activation will insert hundreds of new jobs in a single cron run. The existing code already uses a `PING_BUDGET_PER_RUN = 100` cap in `expire.ts` — creation and description-update pings need the same guard. The second risk is the **aggregator–expire interaction**: the existing `expireMissingJobs` function scopes by employer and must be **skipped entirely** for aggregator-sourced rows, otherwise a single JSearch query that misses employer "Vestas" will soft-delete all native Vestas rows.

**Primary recommendation:** Build in execution priority order — Wave 1 activation first (all six employers share existing adapters), then SmartRecruiters adapter, then aggregators, then discovery Worker, then JSON-LD + Indexing API extension. Trakstar last, with a concrete abort-to-aggregator rule.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Auto-Discovery Worker (COVG-01)**
- D-01: `workers/discover/` new CF Worker, HTTP endpoint `POST /probe`, founder-triggered on-demand
- D-02: Reads from `public.candidates` Supabase table (global, not per-niche)
- D-03: Writes `ats_type`, `confidence`, `probed_at`, `status` back to same table
- D-04: Detection for Workday, Greenhouse, Lever, SmartRecruiters, Recruitee, Softgarden, Ashby, iCIMS

**Aggregator Integration (COVG-03)**
- D-05: Adzuna as `atsType: "adzuna"` in `NicheConfig.atsTargets`
- D-06: JSearch as `atsType: "jsearch"` fallback
- D-07: Dedup via existing SHA-256 key — no extra logic
- D-08: Two new secrets: `ADZUNA_APP_ID`+`ADZUNA_APP_KEY`, `JSEARCH_API_KEY`

**New ATS Adapters**
- D-09: SmartRecruiters adapter in `packages/ats-adapters/src/smartrecruiters.ts`; public REST API, no auth
- D-10: Trakstar adapter for Ørsted — `cronGroup: "every3h"`, fall back to aggregator if fragile
- D-11: Siemens Energy — NO scraper; covered by aggregators; partnership target at Phase 5

**Employer Coverage (COVG-02)**
- D-12: Done = 20 distinct employers; target = 50 via aggregator
- D-13: Wave 1 activation: Nordex (SF), Blattner (Workday), Invenergy (Workday), Avangrid (Workday), Global Wind Service (Recruitee), Deutsche Windtechnik (Softgarden)
- D-14: Path to 20+: Wave 1 (9) + SmartRecruiters employers + Adzuna/JSearch
- D-21: Execution order: (1) Wave 1 → (2) SmartRecruiters → (3) Trakstar last

**JSON-LD JobPosting (SEO-01)**
- D-15: Only render JSON-LD when `description IS NOT NULL`
- D-16: Omit `jobLocation` when not in DB — do not infer or default
- D-17: `validThrough` = `posted_at + 30 days`
- D-18: Required fields: `@type`, `title`, `description`, `datePosted`, `hiringOrganization.name`, `url`

**Google Indexing API Extension (SEO-03)**
- D-19: Add creation pings in `ingest.ts` and description-update pings in `enrich.ts`

**Description Enrichment (SEO-02)**
- D-20: `fetch-description.ts` already coded + untracked — commit, wire tests, confirm flow

### Claude's Discretion
- `candidates` table exact schema
- SmartRecruiters company ID lookup strategy + pagination implementation
- Trakstar token extraction approach
- Adzuna/JSearch response normalization to AtsTarget-compatible job rows
- Discovery Worker confidence scoring heuristics

### Deferred Ideas (OUT OF SCOPE)
- iCIMS adapter
- Siemens Energy partnership outreach (Phase 5)
- Emply adapter (Semco Maritime)
- Workday private tenant workaround
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| COVG-01 | ATS auto-discovery Worker probing employer career pages for ATS signatures | New `workers/discover/` CF Worker; `public.candidates` table; migration 0005 |
| COVG-02 | Expand employer coverage from 3 to minimum 20 (target 50) | Wave 1 uncomment + SmartRecruiters adapter + aggregators |
| COVG-03 | Adzuna aggregator as fallback for employers without native adapters | Adzuna `atsType` in niches; new ingest branch; expire skip for aggregators |
| SEO-01 | JSON-LD `JobPosting` on all enriched job detail pages | Add to `[slug].astro` conditional on `description IS NOT NULL` |
| SEO-02 | Description enrichment operational for all classified jobs | Commit `fetch-description.ts`; wire test; confirm Workday/SF/Recruitee flow |
| SEO-03 | Google Indexing API ping on job creation, expiry, and description update | `pingUrlUpdated` already exists; add calls in `ingest.ts` and `enrich.ts` |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| ATS signature probing (COVG-01) | CF Worker (`workers/discover`) | — | Network fetch + Supabase write; runs on-demand via HTTP |
| Wave 1 employer ingestion (COVG-02) | CF Worker (`workers/ingest`) | — | All 6 use existing adapters; just uncomment targets |
| SmartRecruiters/Trakstar adapters | `packages/ats-adapters` + CF Worker | — | Adapters are pure functions; ingest worker calls them |
| Adzuna/JSearch aggregation (COVG-03) | CF Worker (`workers/ingest`) | — | New `atsType` branches; same queue chain |
| JSON-LD emission (SEO-01) | Frontend SSR (Astro on Pages) | — | Rendered per-request in `[slug].astro` |
| Description enrichment (SEO-02) | CF Worker (`workers/ingest`) — enrich queue | — | `fetch-description.ts` → `enrich.ts` |
| Indexing API pings (SEO-03) | CF Worker (`workers/ingest`) | — | `google-indexing.ts` reused; new call sites in ingest + enrich |
| `candidates` table | Postgres `public` schema | — | Global (not per-niche); one table across all niches |

---

## Standard Stack

### Core (existing — verified from codebase)

| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| `@cloudflare/workers-types` | `^4.x` | CF Worker type bindings | Already in use |
| `@supabase/supabase-js` | `^2.x` | Supabase client | Already in use |
| `@owljobs/niches` | workspace | NicheConfig + AtsTarget union | Extend with new types |
| `@owljobs/ats-adapters` | workspace | Adapter implementations | Add SmartRecruiters, Trakstar |
| `@owljobs/schema` | workspace | `sha256Hex`, `normalizeForKey` | Reuse for dedup |
| `jose` | `^6.x` | RS256 JWT signing for Indexing API | Already in `google-indexing.ts` |

[VERIFIED: codebase grep]

### No New Dependencies Required

All Phase 2 work uses `fetch()` (built-in CF Workers) for external APIs. No new npm packages needed.

[VERIFIED: Adzuna, JSearch, SmartRecruiters all use plain REST APIs over HTTPS]

---

## Architecture Patterns

### System Architecture Diagram

```
Founder POST /probe
        │
        ▼
workers/discover/src/index.ts
  │  fetch(careersUrl)
  │  detect ATS signature
  │  write → public.candidates
  └──────────────────────────

CF Cron → workers/ingest/src/index.ts (scheduled)
        │
        ├─ ingestNiche() per niche
        │    ├─ WorkdayTarget → fetchAllWorkdayJobs()
        │    ├─ SuccessFactorsTarget → fetchAllSuccessFactorsJobs()
        │    ├─ RecruiteeTarget → fetchAllRecruiteeJobs()
        │    ├─ SoftgardenTarget → fetchAllSoftgardenJobs()
        │    ├─ SmartRecruitersTarget → fetchAllSmartRecruitersJobs() [NEW]
        │    ├─ TrakstarTarget → fetchAllTrakstarJobs()              [NEW]
        │    ├─ AdzunaTarget → fetchAllAdzunaJobs()                  [NEW]
        │    └─ JSearchTarget → fetchAllJSearchJobs()                [NEW]
        │         │
        │         │ upsertJob() → pingUrlUpdated(buildPublicUrl(niche,job.id)) on insert [NEW ping]
        │         │
        │         └─ expireMissingJobs() ← SKIP for aggregator sources
        │
        └─ CLASSIFY_QUEUE.send()
               │
               ▼
        classifyPendingJobs() (CF Workers AI)
               │
               └─ ENRICH_QUEUE.send()
                      │
                      ▼
               enrichPendingJobs()
                 │  fetchDescription()
                 │  update description
                 └─ pingUrlUpdated(buildPublicUrl(niche,job.id)) [NEW ping on description update]
                    PAGES_DEPLOY_HOOK

Astro [slug].astro (SSR on Pages)
  │  getJobBySlug() → includes description, posted_at, employers.name
  │
  ├─ description IS NOT NULL AND job.source NOT IN ('adzuna') AND job.location IS NOT NULL?
  │    YES → emit <script type="application/ld+json">JobPosting</script>
  │    NO  → no JSON-LD block
  │
  └─ status === 'expired'? → HTTP 410 (no JSON-LD in expired branch)
```

### Recommended Project Structure for New Code

```
workers/discover/
├── src/
│   └── index.ts          # POST /probe handler; ATS signature detection
├── test/
│   └── probe.test.ts     # Contract tests for detection logic
└── wrangler.toml         # Worker name, Supabase secrets

packages/ats-adapters/src/
├── smartrecruiters.ts    # NEW — public REST, lazy-fetch description
├── trakstar.ts           # NEW — SPA token extraction, cronGroup every3h
├── adzuna.ts             # NEW — snippet-only, description always null
└── jsearch.ts            # NEW — full description available in response

packages/schema/src/migrations/
└── 0005_candidates.sql   # public.candidates table (no niche substitution)

workers/ingest/test/
└── fetch-description.test.ts  # NEW — for the untracked file
```

---

## External API Contracts (Verified)

### Adzuna Search API

[CITED: https://developer.adzuna.com/docs/search]

**Endpoint:** `GET https://api.adzuna.com/v1/api/jobs/{country}/search/{page}`

**Auth:** Query params — `app_id` + `app_key` (no headers).

**Key params:** `what` (keyword), `results_per_page` (max 50), `content-type=application/json`

**Response shape:**
```json
{
  "results": [
    {
      "id": "129698749",
      "title": "Wind Turbine Technician",
      "company": { "display_name": "Vestas" },
      "location": { "area": ["United States", "Texas"], "display_name": "Texas" },
      "description": "Short snippet, NOT the full description — follow redirect_url",
      "created": "2024-11-08T18:07:39Z",
      "redirect_url": "https://adzuna.com/land/ad/129698749?...",
      "contract_type": "permanent",
      "salary_min": 50000,
      "salary_max": 70000
    }
  ],
  "count": 42
}
```

**Critical:** `description` is a short teaser snippet only — the full description is behind `redirect_url`. Do NOT use `description` for the DB `description` field. Store as `null` (lazy enrichment is not possible for aggregator URLs). Set `description = null` for all Adzuna jobs.

**Rate limits:** No documented per-day hard cap in free tier; generous for reasonable usage. Contact Adzuna for high-volume commercial use.

**Country codes for wind turbine market:** `us`, `gb`, `de`, `nl`, `dk`, `se`, `no`, `au`, `ca`

**Adapter pattern:** Eager-fetch = NO description. Map `redirect_url` → `canonicalUrl`, `company.display_name` → employer name hint. Do NOT call `expireMissingJobs` for Adzuna rows (see Pitfall 1).

---

### JSearch (RapidAPI)

[ASSUMED — details from training data; verify rate limits before launch]

**Host:** `jsearch.p.rapidapi.com`

**Endpoint:** `GET /search?query={q}&num_pages=1`

**Auth:** Header `X-RapidAPI-Key: {JSEARCH_API_KEY}`, `X-RapidAPI-Host: jsearch.p.rapidapi.com`

**Response shape:**
```json
{
  "status": "OK",
  "data": [
    {
      "job_id": "...",
      "employer_name": "GE Vernova",
      "job_title": "Wind Turbine Technician",
      "job_description": "Full HTML description — available eagerly",
      "job_apply_link": "https://...",
      "job_posted_at_datetime_utc": "2024-11-01T00:00:00.000Z",
      "job_city": "Houston",
      "job_state": "TX",
      "job_country": "US"
    }
  ]
}
```

**Key difference from Adzuna:** `job_description` is the full description — store it directly (after sanitization). No lazy enrichment needed.

**Free tier quota:** ~150–200 requests/month (ASSUMED — LOW confidence; verify on RapidAPI before choosing query frequency). Use as fallback only, not primary.

**Adapter pattern:** Use `job_description` eagerly. Same no-expire rule as Adzuna.

---

### SmartRecruiters Posting API

[CITED: https://developers.smartrecruiters.com/docs/posting-api, https://developers.smartrecruiters.com/reference/v1listpostings-1]

**Endpoint (list):** `GET https://api.smartrecruiters.com/v1/companies/{companyId}/postings?status=PUBLIC`

**Auth:** None required for public postings.

**Pagination:** `offset` + `limit` query params. Response includes `totalFound`.

**List response shape — descriptions NOT included:**
```json
{
  "limit": 10,
  "offset": 0,
  "totalFound": 42,
  "content": [
    {
      "id": "a4b3c2...",
      "uuid": "...",
      "name": "Wind Turbine Field Technician",
      "releasedDate": "2024-11-01",
      "location": {
        "country": "US",
        "region": "Texas",
        "city": "Houston",
        "remote": false,
        "latitude": 29.7604,
        "longitude": -95.3698
      },
      "ref": "https://api.smartrecruiters.com/v1/companies/{companyId}/postings/{id}"
    }
  ]
}
```

**Detail endpoint (description required):** `GET https://api.smartrecruiters.com/v1/companies/{companyId}/postings/{postingId}`

**Detail response adds:**
```json
{
  "jobAd": {
    "sections": {
      "companyDescription": { "title": "About Us", "text": "<html>..." },
      "jobDescription":      { "title": "The Role",  "text": "<html>..." },
      "qualifications":      { "title": "Requirements", "text": "<html>..." },
      "additionalInformation": { "title": "Benefits", "text": "<html>..." }
    }
  }
}
```

**Adapter pattern:** LAZY-FETCH — list endpoint gives titles/locations (ingest stage); detail endpoint fetches description (enrich stage). This matches the Workday adapter pattern. Add SmartRecruiters branch to `fetch-description.ts`.

**Company ID lookup:** Company ID is usually the slug used in the career page URL (e.g. `vestas` in `jobs.smartrecruiters.com/Vestas`). Confirm from career page source — look for `data-company-id` attribute or the SPA bundle URL. [ASSUMED: lookup heuristic]

---

### Google Indexing API Quota

[CITED: https://developers.google.com/search/apis/indexing-api/v3/quota-pricing]

**Default daily quota:** 200 `publish` requests per day (URL_UPDATED + URL_DELETED combined).

**Per-minute limit:** 380 requests/minute (burst only; daily cap is the binding constraint).

**Existing mitigation in code:** `expire.ts` already has `PING_BUDGET_PER_RUN = 100`. This leaves 100 pings/day for creation + description updates.

**Required action:** Creation pings in `ingest.ts` and description-update pings in `enrich.ts` MUST be gated on the same budget pattern: only ping when `saJson` is present, only ping jobs with `classification_score >= 0.5` (already filtered at enrich stage), cap per-run with a budget constant. Emit console warning when capped.

**Quota increase:** Requires completing a Google form (job-board use case is explicitly supported). Recommend requesting increase once content quality is established.

---

### Google JobPosting Structured Data

[CITED: https://developers.google.com/search/docs/appearance/structured-data/job-posting]

**Required properties (all must be present for Google for Jobs eligibility):**

| Property | Value |
|----------|-------|
| `@context` | `"https://schema.org"` |
| `@type` | `"JobPosting"` |
| `title` | Job title string |
| `description` | Full HTML description — must be non-empty |
| `datePosted` | ISO 8601 date string (from `posted_at`) |
| `hiringOrganization` | Object with `@type: "Organization"` and `name` |

**`jobLocation`:** Conditionally required. Google requires it OR `applicantLocationRequirements` for remote jobs. Per D-16: omit when not in DB (wind turbine field jobs almost always have a physical location; remote-only wind turbine jobs are rare). Omitting produces warnings in Rich Results Test but does NOT disqualify eligibility; inaccurate data causes manual actions.

**`validThrough`:** Recommended, not required per official docs. Include per D-17 — reduces stale listing noise. Must be a future date at render time. **Warning:** flat `posted_at + 30 days` produces a past `validThrough` for jobs still active after 30 days — the Rich Results Test flags this as an error. Use `max(posted_at+30d, now+7d)` to always produce a future date. Expired jobs return 410 and never render JSON-LD; active jobs older than 30 days are the at-risk case.

**JSON-LD guard — full condition chain:** Emit JSON-LD only when ALL of the following are true: (1) `description IS NOT NULL` (D-15); (2) `source NOT IN ('adzuna')` — Adzuna descriptions are teasers and must always be stored as null, so this is redundant in practice but makes intent explicit; (3) `location IS NOT NULL` — D-16 says omit `jobLocation` when absent, but Google flags missing location on non-remote jobs; most aggregator jobs that slip through the description guard will still fail this check. Net: most aggregator-sourced jobs emit no JSON-LD due to null `description`; location is a secondary guard for any that somehow have a description stored.

**Correct JSON-LD block template:**
```typescript
// Source: D-15 through D-18 (CONTEXT.md) + Google JobPosting docs
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS  =  7 * 24 * 60 * 60 * 1000;
// Always a future date: max(posted+30d, now+7d) prevents Rich Results Test errors for long-lived jobs
const validThrough = new Date(
  Math.max(
    new Date(job.posted_at).getTime() + THIRTY_DAYS_MS,
    Date.now() + SEVEN_DAYS_MS
  )
).toISOString();

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "JobPosting",
  "title": job.title,
  "description": job.description,                   // full HTML, already sanitized
  "datePosted": new Date(job.posted_at).toISOString().split("T")[0],
  "validThrough": validThrough,
  "hiringOrganization": {
    "@type": "Organization",
    "name": employerName,
  },
  "url": canonicalUrl,
  // jobLocation: omit if job.location is null (D-16)
  ...(job.location ? {
    "jobLocation": {
      "@type": "Place",
      "address": {
        "@type": "PostalAddress",
        "addressLocality": job.location,
        ...(job.country ? { "addressCountry": job.country } : {}),
      }
    }
  } : {}),
};
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTML sanitization of adapter descriptions | Custom regex stripper | `sanitizeJobDescription()` from `@owljobs/ats-adapters/sanitize` | Already handles DOMPurify Workers no-DOM mode; XSS vectors |
| Dedup of aggregator jobs | Custom dedup table | SHA-256 of `normalizeForKey(employer+title+location)` — existing `upsertJob` 23505 path | Already handles conflict silently |
| Indexing API JWT signing | Custom crypto | `jose` + existing `pingUrlUpdated()` from `google-indexing.ts` | RS256 with WebCrypto already tested |
| ATS type dispatch in `ingest.ts` | New module | Extend the existing `if/else if` chain in `ingestNiche()` | Pattern is consistent; tests cover it |
| Employer upsert | New function | `upsertEmployer()` in `ingest.ts` | Handles normalization and ID generation |

---

## Common Pitfalls

### Pitfall 1: Aggregators + `expireMissingJobs` = Mass Soft-Delete

**What goes wrong:** The current `expireMissingJobs(db, employerId, fetchedJobIds, ...)` queries ALL active jobs for that employer and marks absent ones as expired. Aggregators (Adzuna, JSearch) return per-query slices, not employer-complete sets. An Adzuna query for "wind turbine technician" that returns 10 Vestas jobs on run 1 will soft-delete all other Vestas rows during expiry — including rows from the native SuccessFactors adapter.

**Root cause:** Aggregators share the `employer_id` FK with native ATS rows (same `sha256(normalize(name))` key if names match).

**How to avoid:** In `ingestNiche()`, do NOT call `expireMissingJobs` for `atsType === "adzuna"` or `atsType === "jsearch"`. Aggregator job lifecycle: insert-only, never expire by absence. (Natural expiry occurs if the job stops appearing in aggregator results AND native ATS, which the native adapter handles.)

**Additional consideration:** Aggregator employers may write `ats_type = "adzuna"` to the `employers` row, overwriting a native `ats_type = "workday"`. Fix: in `upsertEmployer`, do not overwrite `ats_type` on conflict if the existing value is a native type. Use `onConflict: "id", ignoreDuplicates: true` — or update only non-ats_type fields.

**Warning signs:** Sudden spike in `expired` count in ingest logs, or native adapter jobs disappearing after an aggregator run.

---

### Pitfall 2: Indexing API Quota Exhaustion on Wave 1 Activation

**What goes wrong:** Wave 1 activates 6 employers simultaneously. Nordex alone has hundreds of jobs; Deutsche Windtechnik has 216. A single cron run can insert 500+ jobs. At one ping per job, the 200/day quota is exhausted in the first run.

**Root cause:** No creation-ping budget cap exists yet (expiry pings have `PING_BUDGET_PER_RUN = 100` but creation pings are not yet implemented).

**How to avoid:** In `ingest.ts`, only ping on creation for jobs where `classification_score >= 0.5` (which won't be known at insert time — classification happens after). Alternative: ping only for jobs already classified (won't apply to brand-new ones). Practical solution: add `CREATION_PING_BUDGET = 50` per ingest run; log when capped. The Indexing API is best-effort — Google will crawl regardless once the sitemap is submitted.

**Warning signs:** `429 Too Many Requests` from `https://indexing.googleapis.com/v3/urlNotifications:publish`.

---

### Pitfall 3: SmartRecruiters Description in List vs. Detail

**What goes wrong:** Treating the list endpoint as eager-fetch (like Greenhouse). The list endpoint does NOT return `jobAd.sections` content. Using the list response's absence of description fields to conclude "no description available" is wrong.

**Root cause:** SmartRecruiters uses a two-call pattern: list → detail. The detail endpoint is referenced via `ref` URL.

**How to avoid:** Build SmartRecruiters as a LAZY adapter (like Workday): ingest stores title/location from the list, `fetch-description.ts` adds a SmartRecruiters branch that calls `GET {ref}` and extracts `jobAd.sections.jobDescription.text + qualifications.text`, then sanitizes.

---

### Pitfall 4: Adzuna Snippet as `description` Triggers JSON-LD Thin Content

**What goes wrong:** The Adzuna `description` field is a short teaser (few sentences). If stored as `description` in the DB, it passes D-15's `IS NOT NULL` check and triggers JSON-LD emission. Google penalizes job boards that emit JSON-LD with thin descriptions — manual actions can delist the entire site.

**Root cause:** D-15 only gates on null, not on content quality.

**How to avoid:** In the Adzuna adapter, always set `description = null` in the adapted job row (Adzuna descriptions are teaser-only; the full description is behind an affiliate redirect that returns Adzuna's site, not the employer's). JSON-LD guard becomes: `description IS NOT NULL AND source NOT IN ('adzuna', 'jsearch')`. [Note: JSearch returns full descriptions, so the `jsearch` exclusion can be relaxed if description passes a length threshold of ~400 chars.]

---

### Pitfall 5: `EmployerInput.atsType` Type Union Missing Aggregator Types

**What goes wrong:** `ingest.ts` line 423 already accepts `"adzuna" | "jsearch"` in `JobInput.source`. But `EmployerInput.atsType` (line 387) only lists `"workday" | "greenhouse" | "successfactors" | "recruitee" | "softgarden" | "direct"`. TypeScript will reject passing `"adzuna"` to `upsertEmployer`.

**Root cause:** `JobInput` and `EmployerInput` type unions were not updated in sync.

**How to avoid:** When adding the Adzuna/JSearch ingest functions, extend `EmployerInput.atsType` to include `"adzuna" | "jsearch" | "smartrecruiters" | "trakstar"`. Validate TypeScript compiles cleanly before merging.

---

### Pitfall 6: `fetch-description.ts` Already in `enrich.ts` but Untracked

**What goes wrong:** `enrich.ts` already imports `fetchDescription` from `./fetch-description.js`. The file is untracked in git. If someone runs `pnpm build` on a fresh clone, it fails with module-not-found.

**Root cause:** Founder wrote the file but didn't commit it.

**How to avoid:** Task 1 of the enrichment work: `git add workers/ingest/src/fetch-description.ts && git commit`. Wire test at the same time.

---

### Pitfall 7: Trakstar Token Fragility — Concrete Abort Rule

**What goes wrong:** Spending time on Trakstar only to discover it requires an OAuth login, making the adapter impossible in Workers without credentials.

**How to avoid:** At implementation start, fetch `https://orsted.hire.trakstar.com` and inspect the response HTML. If the jobs list is in the initial HTML or a `window.__INITIAL_STATE__` / `window.__NEXT_DATA__` blob: proceed. If the page is a login redirect or blank SPA that requires browser JS execution to populate: ABORT and document the fallback ("Ørsted covered by Adzuna queries for `Ørsted wind turbine`"). Do not spend more than 30 minutes on Trakstar investigation.

---

### Pitfall 8: Indexing API Pings Use ATS URL Instead of owljobs.com Public URL

**What goes wrong:** `expire.ts` calls `pingUrlUpdated(saJson, job.canonical_url)` — this pings the employer's ATS job URL, not the owljobs.com page. Google's Indexing API only indexes pages it has crawled from the submitting site's Search Console property. Pinging an external ATS URL provides no SEO benefit and wastes quota.

**Root cause:** `canonical_url` in the DB is the employer ATS URL (the apply link). Phase 1 implemented expiry pings using this field — a likely bug. Phase 2 creation and description-update pings must NOT repeat this pattern.

**How to avoid:** For creation and description-update pings in `ingest.ts` and `enrich.ts`, construct the owljobs.com public URL from the niche config and job ID. Add a helper:
```typescript
function buildPublicUrl(niche: NicheConfig, jobId: string): string {
  return `https://${niche.domain}/jobs/${slugFromId(jobId)}`;
}
```
Pass `buildPublicUrl(niche, job.id)` to `pingUrlUpdated`, NOT `job.canonical_url`.

**Phase 1 bug note:** The expiry ping in `expire.ts` currently pings `job.canonical_url` (ATS URL). This is almost certainly incorrect — flag for investigation as a separate fix after Phase 2 ships. Do not block Phase 2 on it, but document in RUNBOOK.md.

**Warning signs:** Google Search Console shows no URL coverage improvement despite active pinging; quota is consumed with no indexing effect visible in Search Console.

---

### Pitfall 9: `validThrough` Goes Stale for Long-Lived Active Jobs

**What goes wrong:** `validThrough = new Date(posted_at).getTime() + 30 * 24 * 60 * 60 * 1000` produces a past date for any job still in the DB after 30 days. The Rich Results Test reports `validThrough` in the past as a structured data error. Google may demote or exclude the listing from Google for Jobs.

**Root cause:** D-17 specifies "posted_at + 30 days" without accounting for jobs that survive past that date. Wind turbine field roles often stay open 6–12 weeks.

**How to avoid:** Use `Math.max(posted_at+30d, now+7d)` to guarantee `validThrough` is always at least 7 days in the future at render time:
```typescript
const validThrough = new Date(
  Math.max(
    new Date(job.posted_at).getTime() + 30 * 24 * 60 * 60 * 1000,
    Date.now() + 7 * 24 * 60 * 60 * 1000
  )
).toISOString();
```
This does not contradict D-17 (30 days is still the target for fresh jobs); it just extends the window for stale-surviving jobs.

**Warning signs:** Rich Results Test on a job page returns "validThrough is in the past" warning.

---

## Migration: `0005_candidates.sql`

**Filename:** `packages/schema/src/migrations/0005_candidates.sql`
**Schema:** `public` (global — not per-niche; no `«wind_turbine»` substitution needed)

```sql
-- 0005_candidates.sql
-- Auto-discovery candidate table in the global (public) schema.
-- Founder inserts rows; workers/discover probes them and writes results back.
-- Apply after 0004_stale_jobs_consent.sql.

CREATE TABLE IF NOT EXISTS public.candidates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  careers_url TEXT NOT NULL,
  ats_type    TEXT,                 -- Detected: 'workday','greenhouse','lever', etc.
  confidence  FLOAT,               -- 0.0..1.0
  probed_at   TIMESTAMPTZ,
  status      TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','detected','unknown','error')),
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_candidates_status ON public.candidates(status, confidence DESC);
```

[ASSUMED: exact schema; Claude's discretion per CONTEXT.md — this schema follows the spec in Specific Ideas section]

---

## New `AtsTarget` Types (packages/niches/src/index.ts)

Add these interfaces and extend the union:

```typescript
// SmartRecruiters public Postings API (no auth)
export interface SmartRecruitersTarget {
  employer: string;
  atsType: "smartrecruiters";
  /** Company identifier used in the SmartRecruiters API, e.g. "Vestas" */
  companyId: string;
  cronGroup?: CronGroup;
}

// Trakstar (SPA, fragile — fallback to aggregator if token not extractable)
export interface TrakstarTarget {
  employer: string;
  atsType: "trakstar";
  /** Subdomain of hire.trakstar.com, e.g. "orsted" */
  companySlug: string;
  cronGroup?: CronGroup;
}

// Adzuna aggregator — per-query, not per-employer
export interface AdzunaTarget {
  employer: string;           // "adzuna" sentinel (not a real employer)
  atsType: "adzuna";
  /** ISO 3166-1 alpha-2 country code — Adzuna endpoint requires this */
  country: string;
  cronGroup?: CronGroup;
}

// JSearch (RapidAPI) aggregator — fallback
export interface JSearchTarget {
  employer: string;           // "jsearch" sentinel
  atsType: "jsearch";
  cronGroup?: CronGroup;
}

// Updated union:
export type AtsTarget =
  | WorkdayTarget
  | SuccessFactorsTarget
  | GreenhouseTarget
  | RecruiteeTarget
  | SoftgardenTarget
  | SmartRecruitersTarget
  | TrakstarTarget
  | AdzunaTarget
  | JSearchTarget;
```

[ASSUMED: interface design for Adzuna/JSearch — Claude's discretion; verify against actual adapter needs]

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Cloudflare Workers (`wrangler`) | All workers | ✓ | 4.87.0 (from node_modules) | — |
| Vitest | Test suite | ✓ | Detected at repo root | — |
| Supabase (production) | All DB writes | ✓ (assumed production) | — | — |
| `ADZUNA_APP_ID`+`ADZUNA_APP_KEY` | Adzuna adapter | ✗ (not yet registered) | — | JSearch fallback |
| `JSEARCH_API_KEY` | JSearch adapter | ✗ (not yet registered) | — | Adzuna primary |
| `GOOGLE_INDEXING_KEY` | Indexing API | ✓ (Phase 1 setup) | — | Skip pings |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:**
- Adzuna credentials (free registration at api.adzuna.com) — JSearch covers in the interim
- JSearch key (RapidAPI free tier) — Adzuna covers in the interim

[VERIFIED: `wrangler` version from `node_modules/.pnpm`; Vitest from `vitest.config.ts`]

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (root `vitest.config.ts`) |
| Config file | `/vitest.config.ts` at repo root |
| Quick run command | `pnpm vitest run --reporter=verbose` |
| Full suite command | `pnpm vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| COVG-01 | ATS detection returns correct atsType + confidence | unit | `pnpm vitest run workers/discover/test/probe.test.ts` | ❌ Wave 0 |
| COVG-02 | Wave 1 targets parse without error | unit (source contract) | `pnpm vitest run workers/ingest/test/wave1.test.ts` | ❌ Wave 0 |
| COVG-03 | Adzuna adapter does NOT call expireMissingJobs | unit (source contract) | `pnpm vitest run workers/ingest/test/aggregator-no-expire.test.ts` | ❌ Wave 0 |
| COVG-03 | Adzuna response normalization produces valid job rows | unit | `pnpm vitest run packages/ats-adapters/test/adzuna.test.ts` | ❌ Wave 0 |
| SEO-01 | JSON-LD block present when description not null | unit | `pnpm vitest run apps/web/test/jobs.test.ts` | ✅ (extend) |
| SEO-01 | JSON-LD absent when description is null | unit | same file | ✅ (extend) |
| SEO-02 | fetchDescription routes correctly per ats_type | unit | `pnpm vitest run workers/ingest/test/fetch-description.test.ts` | ❌ Wave 0 |
| SEO-03 | pingUrlUpdated called after insert in ingest.ts | unit (source contract) | `pnpm vitest run workers/ingest/test/creation-ping.test.ts` | ❌ Wave 0 |
| SEO-03 | pingUrlUpdated called after description update in enrich.ts | unit (source contract) | `pnpm vitest run workers/ingest/test/description-ping.test.ts` | ❌ Wave 0 |

Pattern for source contract tests (established in `upsert.test.ts`): read the source file as a string; assert the expected code pattern is present in the relevant block.

### Wave 0 Gaps

- [ ] `workers/discover/test/probe.test.ts` — covers COVG-01
- [ ] `workers/ingest/test/aggregator-no-expire.test.ts` — covers COVG-03 expire guard
- [ ] `workers/ingest/test/fetch-description.test.ts` — covers SEO-02 (untracked file)
- [ ] `workers/ingest/test/creation-ping.test.ts` — covers SEO-03 creation
- [ ] `workers/ingest/test/description-ping.test.ts` — covers SEO-03 description update
- [ ] `packages/ats-adapters/test/adzuna.test.ts` — covers COVG-03 adapter
- [ ] `packages/ats-adapters/test/smartrecruiters.test.ts` — covers COVG-02 adapter

Extend `apps/web/test/jobs.test.ts` for JSON-LD assertions (file exists).

---

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | Yes | `sanitizeJobDescription()` (DOMPurify Workers no-DOM) on all adapter descriptions before DB write |
| V2 Authentication | Partial | Discovery Worker `POST /probe` is admin-only — add a `DISCOVER_SECRET` header check; no auth on SmartRecruiters API (public) |
| V4 Access Control | No | Discovery Worker does not expose candidate data publicly |
| V6 Cryptography | Yes (existing) | RS256 JWT in `google-indexing.ts` via `jose`; never hand-roll |

**Discovery Worker auth:** `POST /probe` must verify a `Authorization: Bearer {DISCOVER_SECRET}` header before executing. Without this, any party can trigger expensive ATS probing. Add `DISCOVER_SECRET` as a Worker secret.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | JSearch free tier is ~150–200 requests/month | JSearch API Contract | If lower, JSearch unusable as fallback without paid plan |
| A2 | SmartRecruiters `companyId` matches the slug in the career page URL | SmartRecruiters API Contract | Company ID lookup fails; need to inspect page HTML to find it |
| A3 | Adzuna has no hard per-day cap at free tier | Adzuna API Contract | If there is a daily cap, query frequency must be reduced |
| A4 | `candidates` table schema follows the spec in CONTEXT.md Specific Ideas | Migration | Schema may need adjustment based on Discovery Worker implementation |
| A5 | Aggregator adapter `employer` field in `AtsTarget` acts as a sentinel (not a real employer name) | Standard Stack | If treated as a real employer name, aggregator rows will collide with native rows in `employers` table |

---

## Open Questions (RESOLVED)

1. **Should aggregator rows create `employers` table entries at all?**
   - What we know: `upsertEmployer` is called per-target in `ingest.ts`; aggregator targets have a sentinel `employer` field
   - What's unclear: Do we want `employers` rows for "adzuna" and "jsearch" sources, or should aggregators skip `upsertEmployer`?
   - Recommendation: Skip `upsertEmployer` for aggregator sources entirely; attach the employer hint (from the API's `company.display_name`) to the job row directly. This avoids `ats_type` collision.
   - **RESOLUTION (Plan 06):** Use `ensureAggregatorEmployer` — a dedicated helper that writes a single sentinel employer row per aggregator source using a namespaced sha256 key (`__aggregator__adzuna`, `__aggregator__jsearch`) with a hardcoded `ats_type` discriminant (e.g. `"adzuna"`). This avoids `upsertEmployer` entirely and cannot collide with native employer sha256 keys because the `__aggregator__` prefix is not used by any ATS adapter.

2. **JSearch free-tier quota: sufficient for fallback use?**
   - What we know: Described as "fallback when Adzuna thin" (D-06)
   - What's unclear: The 7 `aggregatorQueries` queries × some frequency = unknown total requests/month
   - Recommendation: Subscribe to RapidAPI Basic (~$10/mo) if free tier is insufficient. Verify quota before deciding.
   - **RESOLUTION:** Proceed with RapidAPI Basic (~$10/mo) if the free tier (500 requests/month) proves insufficient after Phase 2 launch. Monitor actual usage for 2 weeks post-launch before upgrading.

3. **Google Indexing API quota increase: when to request?**
   - What we know: Default 200/day; Wave 1 activation + enrichment will push against this
   - What's unclear: How long Google takes to approve quota increases
   - Recommendation: Submit quota increase form immediately (before Wave 1 activation). In the meantime, cap pings at budget constants in code.
   - **RESOLUTION:** Submit the quota increase form at Wave 1 activation (https://developers.google.com/search/apis/indexing-api/v3/quota-pricing). Code-side budgets (`CREATION_PING_BUDGET=50`, `PING_BUDGET_PER_RUN=100`) enforce the 200/day hard cap while awaiting approval.

---

## Sources

### Primary (HIGH confidence)
- Codebase (verified via direct file reads): `workers/ingest/src/ingest.ts`, `enrich.ts`, `expire.ts`, `google-indexing.ts`, `fetch-description.ts`, `classify.ts`; `packages/niches/src/index.ts`; `packages/ats-adapters/src/`; `apps/web/src/pages/jobs/[slug].astro`; `apps/web/src/lib/jobs.ts`; `vitest.config.ts`
- [CITED: Google Indexing API quota](https://developers.google.com/search/apis/indexing-api/v3/quota-pricing) — 200/day confirmed
- [CITED: SmartRecruiters Posting API docs](https://developers.smartrecruiters.com/docs/posting-api) — no-auth, lazy-fetch description confirmed
- [CITED: SmartRecruiters list vs detail](https://developers.smartrecruiters.com/reference/v1listpostings-1) — jobAd fields absent in list, detail required
- [CITED: Google JobPosting structured data](https://developers.google.com/search/docs/appearance/structured-data/job-posting)

### Secondary (MEDIUM confidence)
- [Adzuna API overview](https://developer.adzuna.com/overview) — endpoint structure, response shape, snippet-only description confirmed
- [Adzuna search docs](https://developer.adzuna.com/docs/search) — app_id/app_key as query params confirmed
- Multiple web sources confirming Google 200/day Indexing API quota

### Tertiary (LOW confidence)
- JSearch (RapidAPI) — rate limits and response shape from training data + community sources; verify on RapidAPI before launch
- Trakstar API — no public documentation; treat as entirely unknown until implementation probes the SPA

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all existing packages verified from codebase
- External API shapes: HIGH (SmartRecruiters, Adzuna), LOW (JSearch, Trakstar)
- Architecture patterns: HIGH — directly derived from existing code patterns
- Common pitfalls: HIGH — derived from direct code reading of `expire.ts`, `ingest.ts`, type definitions

**Research date:** 2026-05-10
**Valid until:** 2026-06-10 (API shapes stable; Trakstar claim invalid until verified)
