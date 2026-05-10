# Phase 2: Employer Breadth & SEO - Context

**Gathered:** 2026-05-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Expand job coverage to 20+ distinct employers and make all job pages discoverable by Google with JobPosting structured data and Indexing API pings. Two parallel tracks: (1) ingest pipeline breadth via Wave 1 activation, aggregator integration, and new ATS adapters; (2) SEO surface via JSON-LD on job detail pages and Indexing API pings on job creation and description update.

Requirements in scope: COVG-01, COVG-02, COVG-03, SEO-01, SEO-02, SEO-03

</domain>

<decisions>
## Implementation Decisions

### Auto-Discovery Worker (COVG-01)

- **D-01:** Discovery runs as a new Cloudflare Worker (`workers/discover`) with an HTTP endpoint — not a local CLI script. Triggered on-demand by the founder (`POST /probe`); no scheduled cron.
- **D-02:** Input: reads employer candidates from a `candidates` table in the **public** (global, not per-niche) Supabase schema. Founder adds entries to this table; Worker fetches all unprobed rows and probes each URL for ATS signatures.
- **D-03:** Output: writes results back to the `candidates` table — sets `ats_type` (detected platform), `confidence` (0.0–1.0 score), `probed_at` timestamp, and `status` (`detected` / `unknown` / `error`). Founder queries Supabase to see the ranked output and decides which employers to activate.
- **D-04:** Detection: probe employer career page HTML for ATS signature patterns (Workday `/wday/` URL patterns, Greenhouse `/boards/` path, Lever `jobs.lever.co` domain, SmartRecruiters `/en/jobs` patterns, Recruitee `.recruitee.com` domain, Softgarden `.softgarden.io` domain, Ashby `jobs.ashbyhq.com`, iCIMS `careers.{tenant}.icims.com`).

### Aggregator Integration (COVG-03)

- **D-05:** Adzuna added as a new `atsType: "adzuna"` in `NicheConfig.atsTargets` — plugs into the existing ingest → classify → enrich pipeline as a peer to native ATS targets. The `aggregatorQueries` field on `NicheConfig` provides the search terms (already defined for wind-turbine niche).
- **D-06:** JSearch (RapidAPI) added as a second aggregator type (`atsType: "jsearch"`) — used as fallback when Adzuna returns thin results for a query. Both are defined as `AtsTarget` entries in the niche config.
- **D-07:** Duplicate handling: existing dedup key (SHA-256 of `normalizeForKey(employer + title + location)`) handles conflicts between aggregator and native ATS jobs. No extra dedup logic needed — conflicting inserts are silently skipped (23505 upsert on PK).
- **D-08:** Two new secrets needed: `ADZUNA_APP_ID` + `ADZUNA_APP_KEY` (register at api.adzuna.com), `JSEARCH_API_KEY` (RapidAPI). Both are Worker secrets on `owljobs-ingest`.

### New ATS Adapters

- **D-09:** SmartRecruiters adapter (`packages/ats-adapters/src/smartrecruiters.ts`) — build in Phase 2. Public REST API: `GET https://api.smartrecruiters.com/v1/companies/{companyId}/postings?status=PUBLIC`. No auth required for job listings. High leverage: unlocks multiple wind employers discoverable via COVG-01.
- **D-10:** Trakstar adapter for Ørsted — attempt to build using token extraction from the Ørsted Trakstar SPA (`orsted.hire.trakstar.com`). **Caveat:** fragile by design (token extraction from SPA breaks on platform updates). If implementation proves unreliable during Phase 2, fall back to aggregator coverage for Ørsted. Set `cronGroup: "every3h"` to reduce probing frequency.
- **D-11:** Siemens Energy (Workday private tenant — returns 401): **do NOT build a scraper**. Covered by Adzuna/JSearch aggregator queries in the interim. Note Siemens Energy as a **partnership outreach target** for Phase 5 (approach after 100 subscribers reached). Anti-pattern from Phase 1 research applies: no Workday scraping.

### Employer Coverage Target (COVG-02)

- **D-12:** Done threshold: **20 distinct employers** with jobs in the DB (native ATS + aggregator combined). Target **50 distinct employer names** appearing in job results via Adzuna/JSearch queries.
- **D-13:** Wave 1 activation in Phase 2: uncomment and activate Nordex (SuccessFactors), Blattner Energy (Workday), Invenergy (Workday), Avangrid Renewables (Workday), Global Wind Service (Recruitee), Deutsche Windtechnik (Softgarden) from `niches/wind-turbine.ts`. Brings native ATS count to 9.
- **D-14:** Path to 20+: Wave 1 (9) + SmartRecruiters employers found via discovery + Adzuna/JSearch aggregator. New adapters and aggregator queries handle the remainder.

### JSON-LD JobPosting (SEO-01)

- **D-15:** Only render `<script type="application/ld+json">` block for jobs where `description IS NOT NULL` — skip JSON-LD entirely for un-enriched jobs. A stub description would trigger Google's thin-content penalty.
- **D-16:** Omit `jobLocation` from the schema when not present in the DB. Do not infer from title, use employer country as fallback, or use "TELECOMMUTE". Omitting is safer than inaccurate data — Google penalizes incorrect structured data.
- **D-17:** Include `validThrough` set to `posted_at + 30 days`. Most wind turbine roles close within 2–4 weeks. This reduces stale listing noise in Google for Jobs results.
- **D-18:** Required fields always included when JSON-LD is rendered: `@type: "JobPosting"`, `title`, `description`, `datePosted` (from `posted_at`), `hiringOrganization.name` (from employer name), `url` (canonical URL).

### Google Indexing API Extension (SEO-03)

- **D-19:** Phase 1 shipped Indexing API for **expiry pings** (`URL_UPDATED` on `status = 'expired'`). Phase 2 extends to: (a) **creation pings** (`URL_UPDATED`) when a new job is inserted in `ingest.ts`; (b) **description update pings** (`URL_UPDATED`) when `description` is written in `enrich.ts`. Auth setup (service account + `GOOGLE_INDEXING_KEY` secret) is already in place — this is a small delta in two files.

### Description Enrichment (SEO-02)

- **D-20:** `workers/ingest/src/fetch-description.ts` is already coded and `enrich.ts` calls it. This file is currently untracked (founder's in-progress work). Phase 2 task: commit it, wire up tests, confirm enrichment is flowing for Workday/SuccessFactors/Recruitee jobs. Greenhouse and Softgarden descriptions are already fetched eagerly at ingest. No significant new code for SEO-02.

### Claude's Discretion

- `candidates` table exact schema — suggested: `(id UUID PK, name TEXT, careers_url TEXT, ats_type TEXT, confidence FLOAT, probed_at TIMESTAMPTZ, status TEXT CHECK ('pending','detected','unknown','error'), notes TEXT)`; place in `public` schema (global, not per-niche)
- SmartRecruiters adapter internal implementation (company ID lookup strategy, pagination)
- Trakstar token extraction approach — if auth token is embedded in page HTML (common for SPAs), parse from initial page load; if via OAuth redirect, document and note as too fragile
- Adzuna/JSearch response normalization to `AtsTarget`-compatible job rows
- Discovery Worker ATS signature detection heuristics and confidence scoring

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` — COVG-01, COVG-02, COVG-03, SEO-01, SEO-02, SEO-03 (the 6 requirements this phase delivers)
- `.planning/ROADMAP.md` — Phase 2 success criteria (5 criteria to verify against)
- `.planning/STATE.md` — Anti-patterns to avoid (especially: no Workday scraping, no stale jobs, email digest pattern)

### Niche Configuration & ATS Adapters
- `niches/wind-turbine.ts` — current `atsTargets` list (Wave 0 active, Wave 1 commented-in); `aggregatorQueries` for Adzuna/JSearch search terms
- `packages/niches/src/index.ts` — `NicheConfig` interface and `AtsTarget` union type; new adapter types (Adzuna, JSearch, SmartRecruiters, Trakstar) must be added here
- `packages/ats-adapters/src/` — existing adapters (Workday, Greenhouse, SuccessFactors, Recruitee, Softgarden); new adapters go here

### Ingest Worker
- `workers/ingest/src/index.ts` — scheduled handler; add creation pings (SEO-03) here after ingest inserts
- `workers/ingest/src/ingest.ts` — ATS fetch logic; creation pings fire after successful insert
- `workers/ingest/src/enrich.ts` — description fetch + write; description update pings (SEO-03) fire after `description` written
- `workers/ingest/src/fetch-description.ts` — already coded, untracked; commit + test in Phase 2
- `workers/ingest/src/google-indexing.ts` — Indexing API ping helper (Phase 1); reuse for creation/update pings
- `workers/ingest/wrangler.toml` — add `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `JSEARCH_API_KEY` secrets

### Frontend (JSON-LD)
- `apps/web/src/pages/jobs/[slug].astro` — job detail page; add `<script type="application/ld+json">` block here (conditional on `description IS NOT NULL`)
- `apps/web/src/lib/jobs.ts` — `getJobBySlug` query result shape; must include `description`, `posted_at`, employer name

### Discovery Worker (new)
- `workers/discover/` — new Worker; similar structure to `workers/ingest/` (wrangler.toml, src/index.ts)
- Public Supabase schema — `candidates` table (new migration needed)
- `packages/schema/src/migrations/` — new migration for `candidates` table in public schema

### Phase 1 Decisions (carry-forward)
- `.planning/phases/01-production-foundation/01-CONTEXT.md` — D-08 through D-10 (Google Indexing API auth setup and anti-patterns)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `workers/ingest/src/google-indexing.ts` — RS256 JWT + OAuth2 + Indexing API ping; reuse as-is for creation and description update pings (D-19)
- `packages/ats-adapters/src/workday.ts` — reference implementation for a lazy-fetch adapter (fetch separately in enrich stage); use as pattern for SmartRecruiters/Trakstar
- `packages/ats-adapters/src/greenhouse.ts` — reference for an eager-fetch adapter (description in ingest response); model for aggregator adapters
- `packages/ats-adapters/src/sanitize.ts` — shared HTML sanitizer; apply to all new adapter descriptions before writing to DB
- `workers/ingest/src/ingest.ts` — `Promise.allSettled` + per-target error isolation pattern; all new AtsTarget types must follow this pattern
- `packages/niches/src/index.ts` — `AtsTarget` union type; new types (Adzuna, JSearch, SmartRecruiters, Trakstar) extend this union

### Established Patterns
- **Dedup key:** SHA-256 of `normalizeForKey(employer + title + location)` — aggregator jobs use the same key; duplicates silently skipped via upsert conflict
- **`Promise.allSettled` in ingest** — partial failures counted in stats, not fatal; new adapters must follow this
- **`classification_score >= 0.5` filter** — all read queries; aggregator jobs flow through classify stage, same threshold
- **`max_batch_size: 2` on queue consumers** — Phase 1 fix; do not change this
- **`PAGES_DEPLOY_HOOK`** — triggered after enrich; remains as-is
- **`cronGroup` on AtsTarget** — controls polling frequency; use `"every3h"` for Trakstar (fragile), `"hourly"` for Adzuna/JSearch

### Integration Points
- Adzuna/JSearch adapters → `ingest.ts` → existing classify→enrich queue chain
- SmartRecruiters/Trakstar adapters → same pipeline
- Discovery Worker → `public.candidates` table in Supabase (separate from per-niche schemas)
- JSON-LD block → `[slug].astro` (conditional on `description IS NOT NULL`)
- Creation/description update pings → `google-indexing.ts` (already imported in ingest worker)

</code_context>

<specifics>
## Specific Ideas

- SmartRecruiters API endpoint: `https://api.smartrecruiters.com/v1/companies/{companyId}/postings?status=PUBLIC` — no auth required. Company ID is found in career page source (typically `data-company-id` attribute or in the SPA bundle URL).
- Discovery Worker confidence scoring: 1.0 for exact URL pattern match (Greenhouse `/boards/{token}` in API response URL), 0.8 for domain match (`.recruitee.com` domain), 0.6 for script/link tag reference in page HTML.
- Trakstar token: check if it's embedded in the initial HTML of `orsted.hire.trakstar.com` as a `data-*` attribute or `window.__INITIAL_STATE__` blob. If it requires a full OAuth login flow, abort and fall back to aggregator for Ørsted.
- `validThrough` formula: `new Date(posted_at).getTime() + 30 * 24 * 60 * 60 * 1000` → ISO 8601 string. Simple, no external data needed.
- candidates table `status` flow: `pending` → Worker probes → `detected` (ATS found) / `unknown` (no ATS found) / `error` (fetch failed). Founder filters `WHERE status = 'detected' ORDER BY confidence DESC` to find activation candidates.

</specifics>

<deferred>
## Deferred Ideas

- **iCIMS adapter** (Quanta Services, ~10k employee wind contractor) — deferred to after Phase 2. Aggregator covers Quanta for now. iCIMS has a semi-public API but requires company-specific configuration. Add to Phase 3 or discovery backlog.
- **Siemens Energy partnership outreach** — deferred to Phase 5 when ≥100 subscribers gives a credible pitch. Document in RUNBOOK.md Phase 5 section alongside Ørsted.
- **Emply adapter** (Semco Maritime) — niche Scandinavian ATS with no documented public API. Deferred; aggregator covers.
- **Workday private tenant workaround** — anti-pattern per Phase 1 research. Do not attempt. Convert high-value Workday employers (Siemens Energy) to partnership conversation at Phase 5.

</deferred>

---

*Phase: 02-Employer Breadth & SEO*
*Context gathered: 2026-05-10*
