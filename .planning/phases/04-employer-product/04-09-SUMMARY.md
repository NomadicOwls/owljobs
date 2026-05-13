---
phase: 04-employer-product
plan: "09"
subsystem: seo-landing-pages
tags: [phase-4, employer-product, seo, landing-pages, multi-niche]
dependency_graph:
  requires: [04-01]
  provides: [seo-landing-pages, NicheConfig.landingPages, [landingSlug].astro]
  affects: [apps/web, packages/niches, niches/wind-turbine]
tech_stack:
  added: []
  patterns: [niche-config-driven routing, single-segment dynamic route, whitelist redirect guard]
key_files:
  created:
    - apps/web/src/components/landing/SeoIntroBlock.astro
    - apps/web/src/pages/[landingSlug].astro
  modified:
    - packages/niches/src/index.ts
    - niches/wind-turbine.ts
decisions:
  - "Single-segment [landingSlug].astro (not catch-all) avoids Astro server-islands conflict (#11793)"
  - "Phase 4 simple filter form: keywords + location concatenated into listJobs q param (ilike on title)"
  - "Whitelist-first guard via niche.landingPages.find(); prefix check as defence-in-depth"
metrics:
  duration: "~12 minutes"
  completed: "2026-05-13"
  tasks_completed: 2
  files_modified: 4
---

# Phase 4 Plan 09: SEO Landing Pages Summary

Niche-config-driven SEO landing-page system. Any niche can add landing pages by extending its `NicheConfig.landingPages[]` array. Wind turbine ships 4 entries. Route at `/{landingSlug}` is a single-segment Astro dynamic page that whitelists slugs against the niche config and renders SeoIntroBlock + JobCardModern grid.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend NicheConfig + add wind-turbine landingPages | 5b97ee1 | packages/niches/src/index.ts, niches/wind-turbine.ts |
| 2 | SeoIntroBlock + [landingSlug].astro page | 43f60a7 | apps/web/src/components/landing/SeoIntroBlock.astro, apps/web/src/pages/[landingSlug].astro |

## What Was Built

### NicheConfig Extension (`packages/niches/src/index.ts`)

New exported interface `LandingPage`:
- `slug: string` — full URL slug
- `label: string` — human H1 label
- `filters: { keywords?: string[]; location?: string }` — passed to `listJobs` `q` param

New optional fields on `NicheConfig`:
- `landingPages?: LandingPage[]`
- `seoFooter?: string`

### Wind Turbine Landing Pages (`niches/wind-turbine.ts`)

4 landing pages declared:
1. `wind-turbine-jobs-austin-tx` — Austin, TX (location filter)
2. `wind-turbine-jobs-offshore-north-sea` — Offshore North Sea (keyword + location)
3. `entry-level-wind-turbine-jobs` — Entry Level (keywords: entry level, junior, trainee)
4. `blade-repair-technician-jobs` — Blade Repair Technicians (keywords: blade repair, blade technician)

### SeoIntroBlock (`apps/web/src/components/landing/SeoIntroBlock.astro`)

Props: `{ label, count, nicheName }`. Renders H1 with label, paragraph with count + accented niche name + date (Month YYYY). Classes: `max-w-3xl mx-auto py-12 text-center`, accent class: `text-accent`.

### [landingSlug].astro (`apps/web/src/pages/[landingSlug].astro`)

- Single-segment dynamic route at root (Pattern 7 — avoids Astro server-islands conflict #11793)
- Step 1: whitelist check — `niche.landingPages?.find(p => p.slug === landingSlug)` → redirect `/404` if not found
- Step 2: prefix safety — `landingSlug.includes(\`${niche.id}-jobs\`)` → redirect `/404` if fails
- Step 3: filter query — keywords + location concatenated, passed to `listJobs(db, niche.supabaseSchema, { page: 1, perPage: 30, q })`
- Cache headers: 3600s CDN, 300s SWR
- Empty state + seoFooter (when present on niche config)

## Multi-Niche Compliance

- `[landingSlug].astro` contains NO hardcoded `"wind-turbine"` or `"wind_turbine"` literal strings
- All niche-specific values derived from `niche.id`, `niche.name`, `niche.supabaseSchema`, `niche.landingPages`, `niche.seoFooter`
- `NicheConfig` fields are optional — existing niches without `landingPages` remain fully compatible

## Verification Results

- `apps/web/test/landing.test.ts`: 3/3 tests PASS (GREEN)
  - "uses niche.landingPages whitelist" — PASS
  - "redirects to 404 for unknown slugs" — PASS
  - "multi-niche: prefix derived from niche, no hardcoded wind-turbine string" — PASS
- `pnpm --filter @owljobs/niches typecheck`: PASS (0 errors)
- `pnpm --filter @owljobs/web build`: PASS (complete, no errors)
- `grep -E "[\"']wind-turbine-jobs[\"']" [landingSlug].astro`: 0 matches

## Deviations from Plan

None — plan executed exactly as written. Pre-existing typecheck errors in `Header.astro` and `Input.astro` are out-of-scope and pre-dated this plan.

## Known Stubs

None. Landing pages render real data from `listJobs`. Empty state renders when no jobs match filters.

## Threat Surface Scan

No new threat surface beyond what is documented in the plan's threat model. The whitelist guard (T-04-30 mitigation) is implemented. Static routes (`/login`, `/dashboard`, `/jobs/*`) take priority over `[landingSlug]` via Astro routing (T-04-31 accepted).

## Self-Check: PASSED

- [x] `apps/web/src/components/landing/SeoIntroBlock.astro` exists
- [x] `apps/web/src/pages/[landingSlug].astro` exists
- [x] `packages/niches/src/index.ts` contains `export interface LandingPage`, `landingPages?: LandingPage[]`, `seoFooter?: string`
- [x] `niches/wind-turbine.ts` contains all 4 slugs
- [x] Commit 5b97ee1 exists (Task 1)
- [x] Commit 43f60a7 exists (Task 2)
- [x] landing.test.ts: 3/3 GREEN
- [x] astro build: PASS
