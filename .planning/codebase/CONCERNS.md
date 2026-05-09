# Codebase Concerns
_Last updated: 2026-05-09_

## Summary

OwlJobs is a young monorepo (two commits) in an early but functional state. The pipeline — ingest → classify → enrich → rebuild — works end-to-end for the single wind-turbine niche. The main risks are: unprotected debug HTTP endpoints on the ingest worker that can be triggered by anyone, a real Supabase service-role JWT committed to `.env.example`, a regex-based HTML sanitizer that is not robust enough for `set:html` rendering, and zero automated tests across the entire codebase. Secondary concerns are a hardcoded placeholder "Featured" job card on the `/jobs` listing page, a growing need to manually add ATS adapters for unsupported systems (Emply, Trakstar, iCIMS), and several schema/type mismatches between the shared `@owljobs/schema` package and actual DB columns.

---

## High Priority

**Unprotected debug endpoints on ingest worker:**
- Issue: `/classify-now`, `/ingest-now`, `/reclassify-ambiguous`, `/enrich-now` accept requests from any caller with no auth header check. Anyone who knows the worker URL can trigger full re-ingestion or mass reclassification.
- Files: `workers/ingest/src/index.ts` lines 103–139
- Impact: Uncontrolled AI API cost (Workers AI billing), DB spam, data corruption via mass reclassification.
- Fix approach: Add a shared-secret check (`Authorization: Bearer <WORKER_SECRET>`) at the top of the `fetch` handler before routing to any debug endpoint. Add `WORKER_SECRET` to `Env` and `wrangler.toml` secrets list.

**Real Supabase service-role JWT in committed `.env.example`:**
- Issue: `apps/web/.env.example` contains what appears to be a real Supabase project URL (`ahccdqsfwvaoorfkzrhe.supabase.co`), a real publishable key, and a real service-role JWT.
- Files: `apps/web/.env.example` lines 6–8
- Impact: Service-role key bypasses RLS — full read/write access to all tables. Committed to git history permanently unless revoked and history-cleaned.
- Fix approach: Immediately rotate the Supabase service-role key in the Supabase dashboard. Replace `.env.example` values with clearly fake placeholders (e.g. `https://YOUR_PROJECT.supabase.co`, `your-anon-key-here`). Never commit real credentials even to example files.

**Regex HTML sanitizer insufficient for `set:html` rendering:**
- Issue: `sanitize.ts` uses a regex allowlist that strips `<script>`, `<style>`, `<iframe>`, event handlers, and `javascript:` hrefs — but does NOT strip `<svg onload=...>`, `<img src=x onerror=...>`, CSS `expression()`, `data:` URIs, or other vectors. The output is rendered verbatim via `set:html={job.description}` in `apps/web/src/pages/jobs/[slug].astro` line 173.
- Files: `packages/ats-adapters/src/sanitize.ts`, `apps/web/src/pages/jobs/[slug].astro:173`
- Impact: Stored XSS if any ATS feed injects malicious HTML. All job detail pages affected.
- Fix approach: Replace the regex sanitizer with DOMPurify (or isomorphic-dompurify for edge/Workers). Alternatively, strip all HTML and render as plain text, using a strict allowlist of tags (`<p>`, `<ul>`, `<li>`, `<br>`, `<strong>`, `<em>`).

**Zero automated tests:**
- Issue: No test files exist anywhere in the monorepo (`find` returns nothing for `*.test.*` / `*.spec.*`).
- Files: Entire codebase
- Impact: Classification logic, ATS adapters, HTML parsers (successfactors.ts), date parsing (ingest.ts `parseWorkdayDate`), and slug construction are all untested. Regressions are invisible.
- Fix approach: Add Vitest. Priority order: (1) `parseWorkdayDate` edge cases, (2) `successfactors.ts` HTML parser against fixture HTML, (3) `sanitizeJobDescription` XSS vectors, (4) `cosine` + threshold logic in `classify.ts`.

---

## Medium Priority

**Hardcoded placeholder "Featured" card in jobs listing:**
- Issue: `apps/web/src/pages/jobs/index.astro` lines 161–172 renders a static `<FeaturedJobCard>` with hardcoded Vestas data (`Senior Wind Turbine Field Service Technician`, `€65K–€85K`, etc.) when no filters are active on page 1. This is not driven by the database — it's a design mockup left in production code.
- Files: `apps/web/src/pages/jobs/index.astro:161-172`
- Impact: Misleads users — the "featured" job links to `href="/jobs"` (the listing page itself), not an actual job. Blocks the real sponsored job feature.
- Fix approach: Remove or gate behind an actual `is_sponsored = true` query result. The `listJobs` function already fetches `is_sponsored` — surface the first sponsored job from the result set instead.

**`softgarden` ATS type missing from `Employer.ats_type` union in schema:**
- Issue: `packages/schema/src/index.ts` defines `Employer.ats_type` as `"workday" | "greenhouse" | "successfactors" | "direct"`. The ingest layer also handles `"recruitee"` and `"softgarden"` (added later), but these are absent from the TypeScript type.
- Files: `packages/schema/src/index.ts:8`, `workers/ingest/src/ingest.ts:302`
- Impact: TypeScript type errors suppressed by the `as unknown as` casts pervasive in the codebase. Actual DB column is TEXT so no runtime failure, but type safety is degraded.
- Fix approach: Add `"recruitee" | "softgarden"` to `Employer.ats_type`. Remove corresponding `as unknown as` casts.

**`as unknown as` type casts throughout data layer:**
- Issue: Supabase's PostgREST client returns `unknown`-typed query results, and the codebase works around this with `data as unknown as JobRow[]` everywhere instead of using Supabase's generated types or a typed schema helper.
- Files: `apps/web/src/lib/jobs.ts` (multiple), `workers/ingest/src/classify.ts:112`, `workers/ingest/src/enrich.ts:36`
- Impact: Type safety is illusory — shape mismatches (e.g., missing column, renamed relation) fail silently at runtime.
- Fix approach: Generate Supabase TypeScript types (`supabase gen types typescript`) and use `Database` generic on the client. Eliminates all `as unknown as` casts.

**SuccessFactors scraper is fragile HTML parsing:**
- Issue: `packages/ats-adapters/src/successfactors.ts` parses employer career pages via `html.split(/<tr\b[^>]*class="[^"]*\bdata-row\b[^"]*"/i)` and regex patterns for title/location/date. Any HTML template change at Vestas or NextEra breaks parsing silently (returns 0 jobs, not an error).
- Files: `packages/ats-adapters/src/successfactors.ts:50-109`
- Impact: Silent data loss — ingest reports 0 new jobs but no error is thrown. Stale job index without alerting.
- Fix approach: Add a minimum-results guard: if `parseRows` returns 0 but `parseTotal` > 0, throw an error so the ingest caller logs it as an adapter failure. Consider switching to SAP SF OData API if credentials become available.

**No job expiry / stale-job cleanup:**
- Issue: The DB schema has an `expires_at` column and the web frontend filters by it (`or(expires_at.is.null,expires_at.gt.${now})`), but nothing in the pipeline ever sets `expires_at` or deletes/deactivates jobs that disappear from ATS feeds.
- Files: `packages/schema/src/migrations/0001_initial.sql:31`, `workers/ingest/src/ingest.ts:362-374`, `apps/web/src/lib/jobs.ts:153`
- Impact: Closed positions remain visible indefinitely. Users apply to jobs that no longer exist. Index grows without bound.
- Fix approach: Track "last seen at" per job. After N consecutive missed ingest cycles (e.g., 3 days), set `expires_at = NOW()`. Alternatively, mark as expired when a job URL returns 404 during the enrich phase.

**`enrich` runs even when no new jobs need enrichment:**
- Issue: After every classify queue message — including runs where `classified = 0` — the worker unconditionally sends a message to `ENRICH_QUEUE`, which then queries Supabase and fires the Cloudflare Pages deploy hook even if 0 jobs were enriched.
- Files: `workers/ingest/src/index.ts:79`, `workers/ingest/src/enrich.ts:16-78`
- Impact: Unnecessary Pages rebuilds (deploy hook fires on every classify cycle, even idle ones), wasted Workers invocations.
- Fix approach: Only send to `ENRICH_QUEUE` when `stats.classified > 0`. Only fire the deploy hook when `stats.enriched > 0`.

**`classify` sends to ENRICH even on error path:**
- Issue: In `workers/ingest/src/index.ts` the `ENRICH_QUEUE.send` call (line 79) runs regardless of whether classify succeeded or partially failed. If classify throws and is caught, `msg.retry()` is called — but on success paths with 0 results, enrich is still triggered.
- Files: `workers/ingest/src/index.ts:71-80`
- Impact: Wasteful but not currently broken. Will matter more as queue volume grows.

**`CLASSIFY_LIMIT` chaining can spin under certain conditions:**
- Issue: If `classifyPendingJobs` consistently returns `hasMore: true` (e.g., a large backlog or a bug that prevents scores from being written), the worker will chain classify messages indefinitely until the Cloudflare queue DLQ limit is hit.
- Files: `workers/ingest/src/index.ts:75-78`, `workers/ingest/src/classify.ts:14`
- Impact: Runaway AI API cost and queue consumption during a backlog or partial failure scenario.
- Fix approach: Add a chain-depth counter (pass as message body field) and cap at e.g. 10 chained classify runs before pausing.

---

## Low Priority / Nice to Fix

**`country` field not set for most ATS sources:**
- Issue: Only Greenhouse ingest passes `country` to `upsertJob`. Workday, SuccessFactors, Recruitee, and Softgarden all leave it null. The `country` filter on the jobs listing page (`listJobs`) is therefore useless for most jobs.
- Files: `workers/ingest/src/ingest.ts:88-106, 121-141, 166-184`
- Impact: Country filter UI exists but returns no results for the majority of jobs.
- Fix approach: Parse country from the `location` string (e.g., ISO 3166-1 alpha-2 via a lookup table) or from ATS-specific metadata where available.

**`parseWorkdayDate` approximation causes incorrect `posted_at` ordering:**
- Issue: Workday returns relative strings like "Posted 3 Days Ago". The parser converts these relative to `Date.now()` at ingest time. On re-ingest, a job originally ingested 10 days ago with "Posted 3 Days Ago" will get its `posted_at` reset to 3 days before the re-ingest run, not the true original date.
- Files: `workers/ingest/src/ingest.ts:271-297`
- Impact: `posted_at` ordering drifts over time; recent-first sort becomes inaccurate for re-ingested jobs.
- Fix approach: Only set `posted_at` on first insert (the `INSERT ... ON CONFLICT DO NOTHING` path); never update it on re-ingest.

**`getJobBySlug` fetches up to 2 rows and picks one ambiguously:**
- Issue: `apps/web/src/lib/jobs.ts:56` queries `.limit(2)` and uses a fallback `?? data[0]` if the prefix match fails. If a hash collision produces two matching IDs, the wrong job could be returned.
- Files: `apps/web/src/lib/jobs.ts:56-66`
- Impact: Extremely unlikely (SHA-256 prefix collision), but the fallback logic is confusing and the `.limit(2)` is not documented.
- Fix approach: Enforce `.limit(1)` after ensuring slug prefix length is long enough (current prefix is likely 8 hex chars = 32-bit — acceptable for the expected job count).

**`FeaturedJobCard` component accepts unsanitized `applyUrl` without validation:**
- Issue: `apps/web/src/pages/jobs/index.astro:165` passes `applyUrl="https://careers.vestas.com"` — fine for a hardcoded mock. When this component is eventually wired to real data, `job.apply_url` should be validated to prevent `javascript:` URIs.
- Files: `apps/web/src/components/FeaturedJobCard.astro` (not read, but referenced)
- Impact: Low risk while hardcoded. Becomes high risk when wired to DB data.

**`discovered_jobs` table is written but never read:**
- Issue: Every `upsertJob` call writes a staging record to `discovered_jobs`, but no code path reads from this table.
- Files: `workers/ingest/src/ingest.ts:348-359`, `packages/schema/src/migrations/0001_initial.sql:62-70`
- Impact: Growing dead table consuming storage. The "aggregator ingest" path that would use this table is not yet implemented.
- Fix approach: Either implement the aggregator pipeline that reads from `discovered_jobs`, or stop writing to it until that phase is built.

**`niche` registry is module-level global state:**
- Issue: `packages/niches/src/index.ts` uses a module-level `Map` as the niche registry. In Cloudflare Workers, this is safe (single isolate per request), but it means niches must be registered at module load time and cannot be dynamically loaded from DB.
- Files: `packages/niches/src/index.ts:75-76`, `workers/ingest/src/index.ts:10`
- Impact: Adding a new niche requires a code deploy. Acceptable for the current single-niche stage, but will need a DB-driven registry for scale.

**`Subscriber` TypeScript type missing `niche` field:**
- Issue: `packages/schema/src/index.ts` defines `Subscriber` without a `niche` field, but migration `0003` added `niche TEXT NOT NULL` to the DB table.
- Files: `packages/schema/src/index.ts:58-65`, `packages/schema/src/migrations/0003_subscribers_multi_niche.sql`
- Impact: Any code using the `Subscriber` type (email sending, etc.) will miss the `niche` field.
- Fix approach: Add `niche: string` to the `Subscriber` interface.

**`ivfflat` index requires manual tuning:**
- Issue: The embedding index in migration 0001 is created with `lists = 100` hardcoded. The Postgres docs recommend `lists = sqrt(row_count)`. At small row counts, `lists = 100` causes slow approximate search; at large row counts (> 10,000 rows), it under-partitions.
- Files: `packages/schema/src/migrations/0001_initial.sql:57-60`
- Impact: Sub-optimal ANN search performance. Not a correctness issue.
- Fix approach: Re-run `CREATE INDEX ... WITH (lists = <sqrt(count)>)` once the table exceeds ~1,000 rows.

---

## Key Facts

- Real Supabase service-role JWT is committed in `apps/web/.env.example` — rotate immediately.
- Debug HTTP endpoints (`/classify-now`, `/ingest-now`, etc.) are publicly accessible with no auth check.
- HTML sanitizer in `packages/ats-adapters/src/sanitize.ts` is insufficient; output is rendered via `set:html`.
- No test files exist anywhere in the monorepo.
- Hardcoded fake "Featured" job card renders on `/jobs` page in production.
- `softgarden` and `recruitee` missing from `Employer.ats_type` TypeScript union.
- `discovered_jobs` table is written on every ingest but never consumed.
- Job expiry / stale-listing cleanup is not implemented despite `expires_at` column existing.
- Pages deploy hook fires on every enrich cycle even when 0 jobs were enriched.
- `Subscriber` TypeScript type is missing the `niche` column added in migration 0003.
