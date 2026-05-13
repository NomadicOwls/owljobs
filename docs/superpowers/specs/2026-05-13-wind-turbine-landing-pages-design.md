# Wind Turbine Landing Pages — Design Spec

**Date:** 2026-05-13
**Niche:** wind-turbine (`mywindturbinejobs.com`)
**File:** `niches/wind-turbine.ts` → `landingPages[]`

## Goal

Expand the `landingPages` array from 3 placeholder entries to 16 curated SEO landing pages. Each page is rendered by the existing `[landingSlug].astro` route. The goal is organic search capture across US wind market states and European markets, plus high-intent specialization searches.

## DB findings (queried 2026-05-13)

7,767 total jobs, 2,176 classified (score ≥ 0.6). Key findings that shaped the final page set:

**Location format:** Jobs store `location` as "City, County" (e.g. "Houston, Harris County") — never "Texas". State-level filtering requires `ilike("location", "%, TX")` or equivalent, not a state name match.

**US states by actual job count:**

| State | Jobs | In original plan? |
|---|---|---|
| Colorado | 111 | No — add |
| California | 93 | No — add |
| New Mexico | 88 | No — add |
| North Dakota | 87 | No — add |
| Texas | 78 | Yes |
| Kansas | 74 | Yes |
| Iowa | 52 | Yes |
| Nebraska | 43 | No — add |
| Illinois | 42 | Yes |
| Indiana | 24 | No — skip (thin) |
| Oklahoma | 21 | Yes — skip (thin vs. others) |
| Wyoming | 16 | Yes — skip (thin) |

**Europe by actual job count:**

| Country | Jobs | Decision |
|---|---|---|
| Germany/Deutschland | 263 | Include |
| United Kingdom | 43 | Include |
| Netherlands | 5 | Skip — too thin |
| France | 5 | Skip — too thin |
| Denmark | 4 | Skip — too thin |
| Sweden | 1 | Skip — too thin |
| Spain | 0 | Skip — no jobs |

## Critical fix required: `listJobs` location filtering

`apps/web/src/lib/jobs.ts` line 37:
```ts
if (q) query = query.ilike("title", `%${q}%`);
```

The `q` param searches **title only**. The landing page route builds `q` from `keywords + location` — meaning `location: "Texas"` becomes a title search for "Texas" and returns ~0 results. Geo pages are currently broken.

**Fix:** add a `location` param to `ListJobsOpts` with a dedicated `ilike("location", ...)` filter. The landing page route should pass location separately from keywords.

## What changes

### `apps/web/src/lib/jobs.ts`
- Add `location?: string` to `ListJobsOpts`
- Add `.ilike("location", `%${location}%`)` filter when `location` is set

### `apps/web/src/pages/[landingSlug].astro`
- Pass `page.filters.location` as `location` param to `listJobs` (not folded into `q`)
- Pass `page.filters.keywords` as `q` (title search) unchanged

### `niches/wind-turbine.ts`
- Replace `wind-turbine-jobs-austin-tx` with the Texas state page
- Keep `blade-repair-technician-jobs` and `wind-turbine-jobs-offshore-north-sea` unchanged
- Add 13 new entries as below

## Full landing page set (16 pages)

### US States (8)

US location strings use state abbreviations in city strings ("Houston, Harris County, TX" style varies by ATS). Location filter uses state abbreviation pattern.

| Slug | Label | `location` filter | `keywords` filter |
|---|---|---|---|
| `wind-turbine-jobs-texas` | Texas | `", TX"` | — |
| `wind-turbine-jobs-colorado` | Colorado | `", CO"` | — |
| `wind-turbine-jobs-iowa` | Iowa | `", IA"` | — |
| `wind-turbine-jobs-kansas` | Kansas | `", KS"` | — |
| `wind-turbine-jobs-new-mexico` | New Mexico | `", NM"` | — |
| `wind-turbine-jobs-north-dakota` | North Dakota | `", ND"` | — |
| `wind-turbine-jobs-nebraska` | Nebraska | `", NE"` | — |
| `wind-turbine-jobs-illinois` | Illinois | `", IL"` | — |

> City pages (Austin, Abilene, etc.) deferred — to be driven by DB location pattern analysis.

### European Countries (2)

Only Germany and UK have enough job density to sustain a page today.

| Slug | Label | `location` filter | Notes |
|---|---|---|---|
| `wind-turbine-jobs-germany` | Germany | `"Deutschland"` | Jobs stored in German ("Bremen, Deutschland") |
| `wind-turbine-jobs-united-kingdom` | United Kingdom | `"UK"` | "Scotland, UK", "Eastern England, UK" etc. |

> France, Denmark, Sweden, Spain, Netherlands all below 6 jobs — revisit when employer ATS coverage grows.

### Specializations (6 total — 2 existing, 4 new)

| Slug | Label | `keywords` | `location` | Status |
|---|---|---|---|---|
| `blade-repair-technician-jobs` | Blade Repair Technicians | `["blade repair", "blade technician"]` | — | existing |
| `wind-turbine-jobs-offshore-north-sea` | Offshore — North Sea | `["offshore"]` | `"North Sea"` | existing |
| `wind-turbine-jobs-offshore` | Offshore Wind Jobs | `["offshore"]` | — | new |
| `entry-level-wind-turbine-jobs` | Entry Level | `["entry level", "entry-level", "trainee", "apprentice"]` | — | new |
| `wind-turbine-jobs-high-voltage` | Electrical & High Voltage | `["high voltage", "HV", "electrical technician"]` | — | new |
| `wind-turbine-jobs-scada` | SCADA & Controls | `["SCADA", "controls", "PLC"]` | — | new |

## Out of scope

- California page — 93 jobs but mostly Kern/Solano County (older wind farms, declining O&M market). Add later if demand signals appear.
- City-level pages — deferred, data-driven
- Norway, Portugal, Spain country pages — no ATS coverage or CSRF walls
- Any new routes, components, or DB migrations beyond the `listJobs` fix
