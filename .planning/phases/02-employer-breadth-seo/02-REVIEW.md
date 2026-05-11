---
phase: 02-employer-breadth-seo
date: 2026-05-11
status: issues_found
depth: standard
files_reviewed: 29
findings:
  critical: 2
  warning: 8
  info: 7
  total: 17
---

# Code Review — Phase 02: Employer Breadth & SEO

## Critical

### CR-01: Unauthenticated debug endpoints expose quota-burning operations

**File:** `workers/ingest/src/index.ts` (fetch handler)  
**Severity:** Critical

Four operational endpoints — `/classify-now`, `/ingest-now`, `/reclassify-ambiguous`, `/enrich-now` — have zero authentication. Any HTTP client that knows the Worker URL can trigger Adzuna/JSearch API calls (paid quota), Workers AI inference costs, Google Indexing API pings (200/day budget), and Cloudflare Pages rebuilds.

Contrast with `workers/discover/src/index.ts:96-99` where `/probe` correctly gates on `Bearer ${env.DISCOVER_SECRET}`.

**Fix:**
```typescript
async fetch(request, env, ctx) {
  const auth = request.headers.get("Authorization");
  if (!auth || auth !== `Bearer ${env.INGEST_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  // ...
}
```
Add `INGEST_SECRET` to `Env` interface and `wrangler.toml` secrets list.

---

### CR-02: expire.ts pings ATS canonical URLs instead of owljobs.com URLs (Pitfall 8)

**File:** `workers/ingest/src/expire.ts:86`  
**Severity:** Critical

`expireMissingJobs` calls `pingUrlUpdated(saJson, job.canonical_url)` where `job.canonical_url` is the employer's ATS URL. The Google Indexing API only processes URLs registered in Search Console — all these expiry pings are silently discarded. Expired jobs on owljobs.com are never deindexed via the API.

Both `ingest.ts` and `enrich.ts` already have the correct pattern using `buildPublicUrl`. `expire.ts` never received `niche` and was not updated.

**Fix:**
```typescript
export async function expireMissingJobs(
  db: SchemaClient,
  employerId: string,
  fetchedJobIds: Set<string>,
  saJson: string | undefined,
  niche: NicheConfig,  // ADD
): Promise<ExpireResult> {
  // line 86:
  const r = await pingUrlUpdated(saJson, buildPublicUrl(niche, job.id));
}
```
Update all 7 callers in `ingest.ts` to pass `niche`.

---

## Warnings

### WR-01: Timing attack on DISCOVER_SECRET comparison

**File:** `workers/discover/src/index.ts:97`

`auth !== \`Bearer ${env.DISCOVER_SECRET}\`` short-circuits on the first differing character — a timing side-channel that allows secret brute-force. Use `crypto.subtle` HMAC comparison for constant-time equality.

---

### WR-02: SSRF via unvalidated careers_url in discover worker

**File:** `workers/discover/src/index.ts:81-86`

`probeCandidate` fetches `candidate.careers_url` without validating it is an `https://` URL. An attacker who can insert rows into `public.candidates` could probe internal infrastructure.

**Fix:**
```typescript
const parsedUrl = new URL(candidate.careers_url); // throws on invalid
if (parsedUrl.protocol !== "https:") return { ats_type: null, confidence: 0, status: "error" };
```

---

### WR-03: Supabase update failures silently swallowed in discover worker

**File:** `workers/discover/src/index.ts:127-135`

The update writing `ats_type`, `confidence`, `probed_at`, `status` back to the candidates table has no error check. A failed update leaves the row as `pending` indefinitely while the summary reports success.

**Fix:** Destructure `{ error }` from the update call and push an error result on failure.

---

### WR-04: JSearch fallback canonical URL is an internal RapidAPI API endpoint

**File:** `packages/ats-adapters/src/jsearch.ts:93`

```typescript
const canonicalUrl = r.job_apply_link ?? `https://jsearch.p.rapidapi.com/job/${r.job_id}`;
```

When `job_apply_link` is null, the fallback stores an internal API URL that returns 401/403 to users. **Fix:** Skip jobs with no apply link: `if (!r.job_apply_link) continue;`

---

### WR-05: JSON-LD incorrectly suppressed for native ATS jobs cross-listed on aggregators

**File:** `apps/web/src/pages/jobs/[slug].astro:67-68`

```typescript
const isAggregator = (job.job_sources ?? []).some((s) => aggregatorSources.has(s.source));
```

`isAggregator` fires if ANY source row references an aggregator — including high-quality Workday/Greenhouse jobs also discovered by Adzuna. A native ATS job with a full enriched description loses its JSON-LD rich result unnecessarily.

**Fix:** Check the employer's `ats_type` rather than the presence of any aggregator source:
```typescript
const isAggregator = ["adzuna", "jsearch"].includes(job.employers?.ats_type ?? "");
```

---

### WR-06: buildPublicUrl duplicated between ingest.ts and enrich.ts

**File:** `workers/ingest/src/ingest.ts:22-24` and `workers/ingest/src/enrich.ts:21-23`

Identical implementation copy-pasted in both files. Drift risk if the slug strategy changes. **Fix:** Extract to `./build-public-url.ts` or export from `./google-indexing.ts`.

---

### WR-07: SmartRecruiters companyId not URL-encoded in canonicalUrl

**File:** `packages/ats-adapters/src/smartrecruiters.ts:99`

```typescript
const canonicalUrl = `https://jobs.smartrecruiters.com/${target.companyId}/${p.id}`;
```

`target.companyId` is not passed through `encodeURIComponent` while the same value IS encoded in the list endpoint URL on line 68. If a companyId has special characters, the stored canonical URL differs from the actual page URL. **Fix:** `encodeURIComponent(target.companyId)`.

---

### WR-08: enrich.ts stores unsanitized description for non-SmartRecruiters paths

**File:** `workers/ingest/src/enrich.ts:69-73`

`fetchDescription` sanitizes in the SmartRecruiters branch but it's not confirmed for Workday, SuccessFactors, and Recruitee branches. Raw employer HTML stored in the DB is later rendered with `set:html` in `[slug].astro`. CLAUDE.md requires dompurify on all employer-editable content.

**Fix:** Apply `sanitizeJobDescription` defensively in `enrich.ts` on the returned string before any DB write.

---

## Info

### IN-01: Missing IF NOT EXISTS on index in migration 0005

**File:** `packages/schema/src/migrations/0005_candidates.sql:22`

`CREATE INDEX idx_candidates_status` has no `IF NOT EXISTS` guard — re-running the migration fails in dev.

---

### IN-02: export { AdaptedJob } in trakstar.ts violates isolatedModules

**File:** `packages/ats-adapters/src/trakstar.ts:21`

Re-exporting a type without `export type` will fail under `isolatedModules: true` (set in `tsconfig.base.json`). **Fix:** `export type { AdaptedJob };`

---

### IN-03: Ternary used as statement for side effects

**File:** `workers/ingest/src/classify.ts:249,252`

`verdict === "yes" ? stats.promoted++ : stats.demoted++;` — use `if/else` for statements with side effects.

---

### IN-04: discover worker tsconfig hard-codes sibling worker's node_modules path

**File:** `workers/discover/tsconfig.json:7-8`

`paths` alias points into `../ingest/node_modules/`. Makes discover impossible to typecheck in isolation. **Fix:** Add `@supabase/supabase-js` as a devDependency in the discover package.

---

### IN-05: discover worker missing devDependencies

**File:** `workers/discover/package.json`

No `typescript`, `vitest`, or `@cloudflare/workers-types` devDependencies. Currently relies on sibling packages.

---

### IN-06: Adzuna result.id declared but never used

**File:** `packages/ats-adapters/src/adzuna.ts:16`

`AdzunaResult.id: string` declared but never referenced — deduplication uses `redirect_url`. Remove or add explanatory comment.

---

### IN-07: console.warn in trakstar stub fires on every cron run

**File:** `packages/ats-adapters/src/trakstar.ts:38-40`

Multi-line `console.warn` in permanently-aborted adapter adds noise to every ingest log. The code comment is sufficient documentation. Demote to `console.debug` or remove.
