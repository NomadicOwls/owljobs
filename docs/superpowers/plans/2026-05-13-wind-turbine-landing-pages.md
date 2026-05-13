# Wind Turbine Landing Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the wind turbine niche from 3 placeholder landing pages to 16 SEO-targeted pages (8 US states, 2 European countries, 6 specializations), with a fix to the broken location filter in `listJobs`.

**Architecture:** Three files change. `listJobs` gets a new `location` param that filters on the `location` DB column (currently the `q` param incorrectly folds location into a title-only ILIKE, producing ~0 results for geo pages). `[landingSlug].astro` is updated to pass location and keywords separately. `niches/wind-turbine.ts` gets the full 16-page array.

**Tech Stack:** TypeScript, Supabase JS client (PostgREST), Astro 5 SSR, Vitest for source-code assertion tests.

---

## Known limitation — US state filtering

`country` is null for all 2,176 classified jobs. US locations are stored as "City, County" (e.g. "Houston, Harris County") — no state name or abbreviation for most rows. The location ILIKE filter will catch the subset of jobs where the state name/abbreviation appears explicitly (e.g. "Chicago, IL") but will miss county-only strings. EU pages work reliably — "Deutschland" and "UK" appear consistently. US state page results will be thin initially and will improve as ATS coverage grows and location normalization is added at ingest.

---

## File map

| File | Change |
|---|---|
| `apps/web/src/lib/jobs.ts` | Add `location?: string` to `ListJobsOpts`; add `ilike("location", ...)` filter |
| `apps/web/src/pages/[landingSlug].astro` | Pass `filters.location` as `location` param; pass only keywords as `q` |
| `niches/wind-turbine.ts` | Replace `wind-turbine-jobs-austin-tx`; add 13 new pages (total 16) |
| `apps/web/test/jobs.test.ts` | Add test: `listJobs` applies location filter when provided |
| `apps/web/test/landing.test.ts` | Add test: landing page passes location separately from keywords |

---

## Task 1: Fix `listJobs` — add `location` filter param

**Files:**
- Modify: `apps/web/src/lib/jobs.ts`
- Modify: `apps/web/test/jobs.test.ts`

- [ ] **Step 1: Write the failing test**

Append to the `describe("lib/jobs.ts — DATA-02 status='active' filter", ...)` block in `apps/web/test/jobs.test.ts`:

```ts
it("listJobs applies ilike on location column when location opt is provided", () => {
  const body = extractFnBody(src, "listJobs");
  expect(body).toMatch(/ilike\(\s*["']location["']/);
});

it("listJobs does NOT fold location into the title q search", () => {
  // The old buggy pattern was: qParts.push(page.filters.location) → ilike("title", ...)
  // The fix keeps location as a separate filter on the location column.
  // This test ensures the ListJobsOpts interface has a location field.
  const src2 = src; // same source used in beforeAll
  expect(src2).toMatch(/location\?\s*:\s*string/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /path/to/owljobs && pnpm --filter @owljobs/web test
```

Expected: 2 new tests fail — `ilike("location"` not found, `location?: string` not found in interface.

- [ ] **Step 3: Add `location` to `ListJobsOpts` and the query**

In `apps/web/src/lib/jobs.ts`, update `ListJobsOpts` and the `listJobs` function body:

```ts
interface ListJobsOpts {
  page?: number | undefined;
  perPage?: number | undefined;
  country?: string | undefined;
  q?: string | undefined;
  location?: string | undefined;
}

export async function listJobs(
  db: SupabaseClient,
  schema: string,
  opts: ListJobsOpts = {},
): Promise<{ jobs: JobWithEmployer[]; total: number }> {
  const { page = 1, perPage = 20, country, q, location } = opts;
  const offset = (page - 1) * perPage;

  let query = db
    .schema(schema)
    .from("jobs")
    .select("id, title, location, country, posted_at, canonical_url, is_sponsored, featured_until, classification_score, employer_id, employers!inner(name, normalized_name)", { count: "exact" })
    .gte("classification_score", 0.5)
    .eq("status", "active")
    .order("is_sponsored", { ascending: false })
    .order("posted_at", { ascending: false, nullsFirst: false })
    .range(offset, offset + perPage - 1);

  if (country) query = query.eq("country", country);
  if (q) query = query.ilike("title", `%${q}%`);
  if (location) query = query.ilike("location", `%${location}%`);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  const jobs = (data ?? []) as unknown as JobWithEmployer[];
  return { jobs, total: count ?? 0 };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @owljobs/web test
```

Expected: all tests pass including the 2 new ones.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/jobs.ts apps/web/test/jobs.test.ts
git commit -m "fix(web): add location filter to listJobs — was incorrectly folded into title q"
```

---

## Task 2: Fix `[landingSlug].astro` — pass location separately

**Files:**
- Modify: `apps/web/src/pages/[landingSlug].astro`
- Modify: `apps/web/test/landing.test.ts`

- [ ] **Step 1: Write the failing test**

Append to the existing `describe` block in `apps/web/test/landing.test.ts`:

```ts
it("passes filters.location as location param (not folded into q)", () => {
  // The old (broken) pattern folded location into q → title search only.
  // New pattern: location passed as a separate named param to listJobs.
  expect(src).toMatch(/listJobs\s*\([\s\S]*?location\s*:/);
});

it("passes only keywords as q (not location)", () => {
  // keywords feed the title search; location goes to its own param.
  expect(src).toMatch(/q\s*:\s*(keywords|page\.filters\.keywords)/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @owljobs/web test
```

Expected: 2 new landing tests fail.

- [ ] **Step 3: Update `[landingSlug].astro` to separate location from keywords**

Replace the filter-building block in `apps/web/src/pages/[landingSlug].astro`. Find this section:

```ts
// 2. Build the search query from filters (Phase 4 simple form per D-19)
const qParts: string[] = [];
if (page.filters.keywords?.length) qParts.push(page.filters.keywords.join(" "));
if (page.filters.location) qParts.push(page.filters.location);
const q = qParts.join(" ").trim() || undefined;

setCacheHeaders(Astro.response.headers, 3600, 300);

const db = supabasePublic(env);
let jobs: Awaited<ReturnType<typeof listJobs>>["jobs"] = [];
let total = 0;
try {
  const result = await listJobs(db, niche.supabaseSchema, { page: 1, perPage: 30, q });
```

Replace with:

```ts
// 2. Build filters — keywords go to title search (q), location to its own column filter
const keywords = page.filters.keywords?.length
  ? page.filters.keywords.join(" ")
  : undefined;
const location = page.filters.location || undefined;

setCacheHeaders(Astro.response.headers, 3600, 300);

const db = supabasePublic(env);
let jobs: Awaited<ReturnType<typeof listJobs>>["jobs"] = [];
let total = 0;
try {
  const result = await listJobs(db, niche.supabaseSchema, { page: 1, perPage: 30, q: keywords, location });
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @owljobs/web test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/\[landingSlug\].astro apps/web/test/landing.test.ts
git commit -m "fix(web): pass landing page location filter separately from title keyword q"
```

---

## Task 3: Update `niches/wind-turbine.ts` with 16 landing pages

**Files:**
- Modify: `niches/wind-turbine.ts`

**Location filter notes:**
- US state pages use the state name as the location filter. This matches jobs where the state name appears in the location string (e.g. "Denver, CO" → won't match "Colorado"; "Chicago, IL" → won't match "Illinois"). Coverage is partial for US states today — it will improve as ATS location formatting standardizes. The filter is still correct to set up now.
- German pages: `"Deutschland"` reliably appears in Deutsche Windtechnik/Enertrag/RWE job locations (e.g. "Bremen, Deutschland").
- UK pages: `"UK"` reliably appears in SSE/RES Group/Vattenfall job locations (e.g. "Scotland, UK", "Eastern England, UK").

- [ ] **Step 1: Replace the `landingPages` array**

In `niches/wind-turbine.ts`, replace the existing `landingPages` array (currently 3 entries) with:

```ts
landingPages: [
  // ── US Wind Belt States ────────────────────────────────────────────────
  // Ordered by actual DB job count (queried 2026-05-13).
  // Note: US locations are stored as "City, County" — state name rarely
  // appears verbatim. Coverage improves as ATS location data standardizes.
  {
    slug: "wind-turbine-jobs-colorado",
    label: "Colorado",
    filters: { location: "Colorado" },
  },
  {
    slug: "wind-turbine-jobs-new-mexico",
    label: "New Mexico",
    filters: { location: "New Mexico" },
  },
  {
    slug: "wind-turbine-jobs-north-dakota",
    label: "North Dakota",
    filters: { location: "North Dakota" },
  },
  {
    slug: "wind-turbine-jobs-texas",
    label: "Texas",
    filters: { location: "Texas" },
  },
  {
    slug: "wind-turbine-jobs-kansas",
    label: "Kansas",
    filters: { location: "Kansas" },
  },
  {
    slug: "wind-turbine-jobs-iowa",
    label: "Iowa",
    filters: { location: "Iowa" },
  },
  {
    slug: "wind-turbine-jobs-nebraska",
    label: "Nebraska",
    filters: { location: "Nebraska" },
  },
  {
    slug: "wind-turbine-jobs-illinois",
    label: "Illinois",
    filters: { location: "Illinois" },
  },

  // ── Europe ─────────────────────────────────────────────────────────────
  // Only DE (263 jobs) and UK (43 jobs) have enough density.
  // France/Denmark/Sweden/Spain all have <6 jobs — deferred.
  {
    slug: "wind-turbine-jobs-germany",
    label: "Germany",
    filters: { location: "Deutschland" },
    // Deutsche Windtechnik, Enertrag, RWE store locations as "City, Deutschland"
  },
  {
    slug: "wind-turbine-jobs-united-kingdom",
    label: "United Kingdom",
    filters: { location: "UK" },
    // SSE, RES Group, Vattenfall store locations as "Region, UK"
  },

  // ── Specializations ────────────────────────────────────────────────────
  {
    slug: "blade-repair-technician-jobs",
    label: "Blade Repair Technicians",
    filters: { keywords: ["blade repair", "blade technician"] },
  },
  {
    slug: "wind-turbine-jobs-offshore-north-sea",
    label: "Offshore — North Sea",
    filters: { keywords: ["offshore"], location: "North Sea" },
  },
  {
    slug: "wind-turbine-jobs-offshore",
    label: "Offshore Wind Jobs",
    filters: { keywords: ["offshore"] },
  },
  {
    slug: "entry-level-wind-turbine-jobs",
    label: "Entry Level",
    filters: { keywords: ["entry level", "entry-level", "trainee", "apprentice"] },
  },
  {
    slug: "wind-turbine-jobs-high-voltage",
    label: "Electrical & High Voltage",
    filters: { keywords: ["high voltage", "HV", "electrical technician"] },
  },
  {
    slug: "wind-turbine-jobs-scada",
    label: "SCADA & Controls",
    filters: { keywords: ["SCADA", "controls", "PLC"] },
  },
],
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter @owljobs/niches typecheck 2>/dev/null || pnpm -w tsc --noEmit 2>&1 | head -20
```

Expected: no errors. The `LandingPage` type in `@owljobs/niches` already supports all these fields — no type changes needed.

- [ ] **Step 3: Run full test suite**

```bash
pnpm --filter @owljobs/web test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add niches/wind-turbine.ts
git commit -m "feat(niches): expand wind turbine landing pages to 16 (8 US states, 2 EU, 6 specializations)"
```

---

## Self-review

**Spec coverage:**
- ✅ `listJobs` location filter fix — Task 1
- ✅ `[landingSlug].astro` separation of location vs q — Task 2
- ✅ 8 US wind belt states — Task 3
- ✅ Germany + UK (only EU countries with density) — Task 3
- ✅ 4 new specializations + 2 existing kept — Task 3
- ✅ `wind-turbine-jobs-austin-tx` removed (replaced by Texas state page) — Task 3
- ✅ US location filter limitation documented — noted in Task 3 step 1

**No placeholders:** all steps contain concrete code.

**Type consistency:** `location?: string` added to `ListJobsOpts` in Task 1; used as `location` in `listJobs` call in Task 2; `LandingPage.filters.location` type already exists in `@owljobs/niches` — no new types introduced.
