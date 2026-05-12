# Phase 4: Employer Product - Context

**Gathered:** 2026-05-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 4 delivers everything an employer sees, logs into, and manages before paying. This includes:
- Auto-generated company profile pages at `/employers/[slug]` with "Claim this listing" CTA
- Magic-link employer auth via Supabase + `employer_users` join table
- Employer dashboard at `/dashboard` — profile view, featured job toggles, performance analytics, locked edit form preview
- Featured jobs wired to real `featured_until` DB data (replacing dummy placeholder)
- SEO landing pages for curated locations/job-types (same filtered-listing pattern, defined in niche config)

Phase 5 charges for the features this phase builds. Phase 5 is not in scope here.

</domain>

<decisions>
## Implementation Decisions

### Claim Flow & Auth
- **D-01:** Claim verification = **email domain match, auto-approve** — employer enters work email (e.g. hr@vestas.com); system checks email domain against `employers.domain` field; if match → auto-approved, no manual step.
- **D-02:** `employers` table gets a nullable `domain TEXT` column — populated manually by founder at first (or parsed from ATS URL). This is the source of truth for domain matching.
- **D-03:** Auth → employer link via **`employer_users(auth_id UUID, employer_id UUID)` join table** (in `public` schema, not per-niche) — supports multiple users per employer. Claim flow inserts a row here after domain verification succeeds.
- **D-04:** Magic-link login via Supabase Auth (`@supabase/ssr ^0.10.0`) — existing requirement; `employer_id` JWT claim injected via Supabase Auth Hook (already in REQUIREMENTS.md).

### Dashboard Scope
- **D-05:** Dashboard URL = **`/dashboard`** — single protected route, RLS-enforced via `employer_id` JWT claim.
- **D-06:** Profile editing (PROF-05: description, logo, structured fields) = **build the full edit form in Phase 4, but show it as locked** — "Available on paid plan — coming in Phase 5." Employers see the value prop without needing billing to exist yet.
- **D-07:** Featured job slot limit in Phase 4 = **unlimited** — Phase 5 enforces slot limits when billing is live. No artificial cap now.
- **D-08:** Dashboard shows: employer profile (view), featured job toggles, 30-day analytics, locked edit form. Logo upload (PROF-06) is also shown locked.

### Analytics Tracking (ANLYT-01)
- **D-09:** Tracking backend = **Cloudflare Workers Analytics Engine** — edge-native, free, no DB writes per event, purpose-built for high-frequency event data. Named dataset binding in `apps/web/wrangler.toml`.
- **D-10:** Event writes = **server-side in Pages Functions** — view event written in `jobs/[slug].astro` handler; apply-click tracked via `/api/track?job=X&type=apply` endpoint (records event, then redirects to ATS URL). No client-side JS required; works with ad-blockers.
- **D-11:** Dashboard stats = **query Analytics Engine SQL API from a Pages Function** — `/api/stats?employer_id=X` calls CF Analytics Engine SQL API server-side, returns 30-day aggregated counts. No Supabase write-side needed.

### Featured Jobs Display
- **D-12:** Featured jobs = **separate DB query for active `featured_until` jobs, shown first** — query `WHERE featured_until > NOW()` as a separate list, rendered above the regular listing using existing `FeaturedJobCard.astro`. Regular listing excludes featured jobs to avoid duplication.
- **D-13:** Featured duration = **30 days** — `featured_until = NOW() + INTERVAL '30 days'` when employer toggles featured on. Employer can re-feature after expiry.
- **D-14:** Visual treatment = **existing `FeaturedJobCard.astro` + `SponsoredBadge.astro` components** — already built with floating "Featured" badge. Wire to real DB data instead of dummy placeholder.
- **D-15:** Homepage employer carousel (FEAT-04) = **deferred to Phase 5** — it's a paid Tier 2+ feature; building it without billing enforcement is premature.

### SEO Landing Pages
- **D-16:** Landing pages are added to **Phase 4 scope** alongside employer profile pages — same pattern (filtered job listing + SEO meta), no new infra needed.
- **D-17:** URL format = **flat slug** — e.g. `/wind-turbine-jobs-austin-tx`, `/wind-turbine-jobs-offshore-north-sea`. The niche job keyword prefix (e.g. `wind-turbine-jobs`) is derived from `niche.slug` to stay multi-niche safe.
- **D-18:** Page list = **curated in niche config** — `NicheConfig` gets a `landingPages` array: `{ slug: string, label: string, filters: { keywords?: string[], location?: string } }[]`. Defined in `niches/wind-turbine.ts`.
- **D-19:** Page content = **auto-generated intro paragraph + filtered job listing** — intro is a template: "X open [niche.name] jobs in [label] as of [date]." followed by the standard job list. No manually written content per page.
- **D-20:** Route = **Astro dynamic route** — `pages/[...path].astro` OR a dedicated `pages/[niche-jobs-slug].astro` — researcher to determine best Astro routing approach given the flat URL pattern. Must support multi-niche (prefix derived from runtime niche config).

### Claude's Discretion
- Logo.dev auto-fetch for unclaimed employers (PROF-01): implementation detail — use `employers.domain` field as the logo.dev lookup key once it exists; fall back to employer initials (already implemented in `/employers/[slug].astro`).
- RLS policy specifics for `employer_users` and dashboard — researcher to design based on `employer_id` JWT claim pattern in STATE.md.
- Candidate match alert emails (ANLYT-02) — implementation detail; fire weekly via digest worker pattern, scoped to niche.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase requirements & roadmap
- `.planning/ROADMAP.md` — Phase 4 success criteria (5 items), requirement IDs: PROF-01–06, FEAT-01–04, ANLYT-01–02
- `.planning/REQUIREMENTS.md` — Full requirement text for PROF, FEAT, ANLYT categories
- `.planning/STATE.md` — Key decisions: `featured_until TIMESTAMPTZ` self-expiring sort, `employer_id` JWT claim via Auth Hook, `@supabase/ssr ^0.10.0`

### Existing employer pages (extend, don't replace)
- `apps/web/src/pages/employers/[slug].astro` — existing employer profile page (136 lines); add "Claim" CTA and logo.dev here
- `apps/web/src/lib/jobs.ts` — `listEmployerJobs()` already exists; extend for featured sort
- `apps/web/src/pages/jobs/index.astro` — has hardcoded `FeaturedJobCard` placeholder to replace with real query

### Existing featured components (wire to real data)
- `apps/web/src/components/FeaturedJobCard.astro` — existing featured card component
- `apps/web/src/components/SponsoredBadge.astro` — "Featured" badge component
- `apps/web/src/components/JobCardModern.astro` — already handles `featured_until` and `is_sponsored` fields

### Auth pattern
- `CLAUDE.md` §Hard Rules — `@supabase/ssr ^0.10.0` mandatory; `employer_id` JWT claim via Auth Hook; `dompurify` for sanitized HTML (not sanitize-html)

### Analytics Engine
- Cloudflare Workers Analytics Engine docs (researcher to fetch) — dataset binding, SQL API query format, `writeDataPoint()` API

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `FeaturedJobCard.astro` + `SponsoredBadge.astro`: fully built featured job UI — wire `featured_until` from DB, remove hardcoded dummy
- `JobCardModern.astro`: already checks `featured_until > new Date()` — correct behavior, just needs real data
- `listEmployerJobs()` in `apps/web/src/lib/jobs.ts`: existing query — extend for featured sort and logo field
- `supabasePublic()` / `supabaseAdmin()` patterns in `apps/web/src/lib/supabase.ts`: established patterns for DB access in Pages Functions
- `getEnv()` and `Astro.locals.niche`: established patterns for niche context in every page

### Established Patterns
- SSR auth via `@supabase/ssr`: Pages Functions handle session cookies; `Astro.locals` carries user/session
- RLS via `employer_id` JWT claim: Auth Hook injects claim; RLS policies check it (no joins needed)
- Multi-niche: all new code uses `niche.supabaseSchema`, `niche.domain`, `niche.slug` — never hardcoded
- `dompurify` for all employer-editable HTML input (CLAUDE.md hard rule)
- Cloudflare Queues pattern from digest worker: same approach for ANLYT-02 candidate match alert emails

### Integration Points
- `apps/web/wrangler.toml`: add `analytics_engine_datasets` binding for Workers Analytics Engine
- `niches/wind-turbine.ts`: add `landingPages[]` array for SEO location/job-type pages
- `packages/schema/src/migrations/`: migration needed for `employers.domain`, `employer_users` table, `featured_until` on jobs (check if already exists from STATE.md key decisions)

</code_context>

<specifics>
## Specific Ideas

- **Location landing page URL pattern**: User wants flat slugs like `/wind-turbine-jobs-austin-tx`, `/wind-turbine-jobs-offshore-north-sea`. Full niche keyword in URL for SEO. Prefix derived from `niche.slug`.
- **Landing page types beyond location**: User confirmed future pages like `/entry-level-wind-turbine-jobs`, `/blade-repair-technician-jobs-berlin-de`, `/offshore-wind-farm-jobs` — all follow the same pattern (`landingPages` config entry with keyword filters + optional location).
- **Dashboard layout reference**: User wants the same visual style as the existing frontend (wind turbine theme, Geist fonts, Tailwind). No external design reference given — stay consistent with existing site design.
- **Claim form**: Entry point is a "Claim this listing" CTA on the `/employers/[slug]` page. Clicking opens a form (same page or modal) where employer enters work email. Magic link sent → employer lands on `/dashboard`.

</specifics>

<deferred>
## Deferred Ideas

- **Homepage employer carousel (FEAT-04)**: Deferred to Phase 5 — it's a Tier 2+ paid feature; building it without billing enforcement is premature.
- **Self-serve multi-user employer accounts**: `employer_users` join table supports multiple users but the claim flow only handles one claimant. Multi-user management (invite team members) is a future capability.
- **Candidate match alert emails (ANLYT-02)**: Added to scope but implementation detail left to researcher — fires weekly via cron, scoped by niche. If complex, can be its own plan.

</deferred>

---

*Phase: 4-Employer Product*
*Context gathered: 2026-05-12*
