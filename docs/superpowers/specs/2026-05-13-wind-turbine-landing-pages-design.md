# Wind Turbine Landing Pages — Design Spec

**Date:** 2026-05-13
**Niche:** wind-turbine (`mywindturbinejobs.com`)
**File:** `niches/wind-turbine.ts` → `landingPages[]`

## Goal

Expand the `landingPages` array from 3 placeholder entries to 20 curated SEO landing pages. Each page is rendered by the existing `[landingSlug].astro` route — no new infrastructure needed. The goal is organic search capture across the two primary candidate audiences: US wind belt workers and European wind industry workers, plus high-intent specialization searches.

## What changes

- Replace `wind-turbine-jobs-austin-tx` (too narrow, redundant once Texas state page exists) with `wind-turbine-jobs-texas`
- Keep `blade-repair-technician-jobs` and `wind-turbine-jobs-offshore-north-sea` unchanged
- Add 17 new entries (8 US states, 6 European countries, 4 specializations)

## Full landing page set (20 pages)

### US Wind Belt States (8)

Ordered by installed wind capacity. City-level pages deferred — to be added based on location patterns found in the DB.

| Slug | Label | Filters |
|---|---|---|
| `wind-turbine-jobs-texas` | Texas | `location: "Texas"` |
| `wind-turbine-jobs-iowa` | Iowa | `location: "Iowa"` |
| `wind-turbine-jobs-oklahoma` | Oklahoma | `location: "Oklahoma"` |
| `wind-turbine-jobs-kansas` | Kansas | `location: "Kansas"` |
| `wind-turbine-jobs-illinois` | Illinois | `location: "Illinois"` |
| `wind-turbine-jobs-colorado` | Colorado | `location: "Colorado"` |
| `wind-turbine-jobs-minnesota` | Minnesota | `location: "Minnesota"` |
| `wind-turbine-jobs-wyoming` | Wyoming | `location: "Wyoming"` |

### European Countries (6)

Hand-picked by employer ATS density. Netherlands and Portugal omitted — too few active postings to sustain a page. Norway omitted — no working ATS target (Equinor CSRF wall, Equinor/Ørsted blocked).

| Slug | Label | Filters | Key employers |
|---|---|---|---|
| `wind-turbine-jobs-germany` | Germany | `location: "Germany"` | Deutsche Windtechnik, Enertrag, RWE, Siemens Energy, Nordex |
| `wind-turbine-jobs-united-kingdom` | United Kingdom | `location: "United Kingdom"` | SSE Renewables, RES Group, Vattenfall, Engie |
| `wind-turbine-jobs-denmark` | Denmark | `location: "Denmark"` | Vestas, Nordex, Global Wind Service |
| `wind-turbine-jobs-sweden` | Sweden | `location: "Sweden"` | Vattenfall, Enertrag |
| `wind-turbine-jobs-spain` | Spain | `location: "Spain"` | Acciona Energía, Siemens Energy |
| `wind-turbine-jobs-france` | France | `location: "France"` | Engie, RES Group, EDP Group |

### Specializations (6 total — 2 existing, 4 new)

| Slug | Label | Filters | Status |
|---|---|---|---|
| `blade-repair-technician-jobs` | Blade Repair Technicians | `keywords: ["blade repair", "blade technician"]` | existing |
| `wind-turbine-jobs-offshore-north-sea` | Offshore — North Sea | `keywords: ["offshore"], location: "North Sea"` | existing |
| `wind-turbine-jobs-offshore` | Offshore Wind Jobs | `keywords: ["offshore"]` | new |
| `entry-level-wind-turbine-jobs` | Entry Level | `keywords: ["entry level", "entry-level", "trainee", "apprentice"]` | new |
| `wind-turbine-jobs-high-voltage` | Electrical & High Voltage | `keywords: ["high voltage", "HV", "electrical technician"]` | new |
| `wind-turbine-jobs-scada` | SCADA & Controls | `keywords: ["SCADA", "controls", "PLC"]` | new |

## Implementation

All changes are in `niches/wind-turbine.ts` only — the `landingPages` array. No schema changes, no new routes, no new components. The `[landingSlug].astro` page already handles arbitrary entries from this array.

**Remove:** `wind-turbine-jobs-austin-tx`
**Keep:** `blade-repair-technician-jobs`, `wind-turbine-jobs-offshore-north-sea`
**Add:** 17 new entries as above

## Out of scope

- City-level pages (Austin, Abilene, Amarillo etc.) — deferred, driven by DB location data
- Netherlands, Portugal, Norway country pages — too thin / no ATS coverage
- Commissioning technician, rope access specialization pages — real but thin
- Any new routes, components, or DB migrations
