# Phase 4: Employer Product - Research

**Researched:** 2026-05-12
**Domain:** Supabase Auth (SSR magic-link), Cloudflare Analytics Engine, Astro SSR routing, employer profile/dashboard UI
**Confidence:** HIGH (verified stack items) / MEDIUM (Auth Hook pattern)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: Claim verification = email domain match, auto-approve
- D-02: `employers` table gets nullable `domain TEXT` column
- D-03: Auth via `employer_users(auth_id UUID, employer_id TEXT)` join table in `public` schema
- D-04: Magic-link login via Supabase Auth (`@supabase/ssr ^0.10.0`), `employer_id` JWT claim via Auth Hook
- D-05: Dashboard URL = `/dashboard`
- D-06: Profile editing shown locked ("Available on paid plan")
- D-07: Featured job slot limit = unlimited in Phase 4
- D-08: Dashboard shows: profile view, featured job toggles, 30-day analytics, locked edit form
- D-09: Tracking backend = Cloudflare Workers Analytics Engine
- D-10: Event writes = server-side in Pages Functions
- D-11: Dashboard stats = query Analytics Engine SQL API from Pages Function `/api/stats`
- D-12: Featured jobs = separate DB query for active `featured_until` jobs, shown first
- D-13: Featured duration = 30 days
- D-14: Use existing `FeaturedJobCard.astro` + `SponsoredBadge.astro` components
- D-15: Homepage employer carousel (FEAT-04) = deferred to Phase 5
- D-16: SEO landing pages added to Phase 4 scope
- D-17: URL format = flat slug (e.g. `/wind-turbine-jobs-austin-tx`)
- D-18: Landing pages curated in niche config (`landingPages[]` array)
- D-19: Page content = auto-generated intro + filtered job listing
- D-20: Route = Astro dynamic route — single-segment `[landingSlug].astro` at root (see Architecture Patterns)

### Claude's Discretion
- Logo.dev implementation detail — use `employers.domain` as lookup key, fall back to initials
- RLS policy specifics for `employer_users` and dashboard
- Candidate match alert emails (ANLYT-02) — extend `workers/digest` with second cron handler

### Deferred Ideas (OUT OF SCOPE)
- Homepage employer carousel (FEAT-04) — deferred to Phase 5
- Self-serve multi-user employer accounts
- Candidate match alert emails detail (may be standalone if complex — but research recommends integrating into digest worker)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PROF-01 | Auto-generated company profile pages — name, logo (logo.dev), all open roles | Logo.dev URL format verified; `EmployerLogo.astro` pattern documented |
| PROF-02 | "Claim this listing" CTA on all auto-generated company pages | `ClaimListingCTA.astro` + `ClaimListingModal.astro` pattern; claim flow via `/api/employer/claim` |
| PROF-03 | Magic-link employer login via Supabase Auth + `@supabase/ssr` ^0.10.0 | Full auth flow pattern documented; `@supabase/ssr` install verified needed |
| PROF-04 | Employer dashboard — view claimed company page, manage featured jobs, view performance metrics | Dashboard architecture documented; Analytics Engine SQL API pattern provided |
| PROF-05 | Editable company profile — shown locked at paid tier in Phase 4 | `LockedFeatureCard` pattern; no dompurify needed in Phase 4 (editing disabled) |
| PROF-06 | Logo upload — shown locked in Phase 4 | `LogoUploadPreview` locked pattern documented |
| FEAT-01 | `featured_until TIMESTAMPTZ` column with self-expiring sort | Column EXISTS; index is WRONG — migration needed (see Critical Finding 3) |
| FEAT-02 | Featured jobs appear pinned at top with visual "Featured" badge | `FeaturedJobCard.astro` exists; needs data wire-up from real query |
| FEAT-03 | Employer can toggle featured status from dashboard | `/api/jobs/[id]/featured` endpoint pattern documented |
| FEAT-04 | Featured employers in homepage carousel | DEFERRED to Phase 5 |
| ANLYT-01 | 30-day views, clicks, apply-link clicks per job | Analytics Engine binding + SQL API pattern documented |
| ANLYT-02 | Weekly candidate match alert email to employers | Extend `workers/digest`; second cron + queue consumer pattern documented |
</phase_requirements>

---

## Summary

Phase 4 adds the employer-facing product layer on top of the existing ingest/frontend stack. It has four technically distinct sub-problems: (1) extending `employers` table and adding `employer_users` join table with correct type alignment; (2) implementing Supabase magic-link auth with `@supabase/ssr` (currently not installed) and an Auth Hook that injects `employer_id` into the JWT; (3) wiring Cloudflare Analytics Engine for page-view and apply-click tracking with a server-side SQL API query for the dashboard; and (4) adding SEO landing pages via a safe Astro routing pattern.

Three critical pre-execution findings must be addressed in Wave 0 migrations/setup before any feature code is written: the `employer_id` type mismatch in D-03, the absence of `@supabase/ssr` in `package.json`, and the wrong partial index on `featured_until`. If these are not resolved first, Wave 1 implementation will fail or produce incorrect behavior.

For ANLYT-02, the correct approach is to extend `workers/digest` with a second cron trigger (Monday 06:00 UTC) and a separate queue consumer, reusing all existing Supabase and Resend wiring. A separate worker is unnecessary overhead.

**Primary recommendation:** Follow the 4-wave build order — Wave 0 (migrations + deps), Wave 1 (auth + profile extensions in parallel), Wave 2 (dashboard + analytics), Wave 3 (SEO landing pages), Wave 4 (ANLYT-02 digest extension).

---

## Critical Findings (Planner Must Address)

### Critical Finding 1: `employer_id` Type Mismatch in D-03

D-03 specifies `employer_users(auth_id UUID, employer_id UUID)`. However, `wind_turbine.employers.id` is `TEXT PRIMARY KEY` (SHA-256 hash of normalized name) per `0001_initial.sql`. A `UUID` foreign key to a `TEXT` PK is impossible without a type cast; the FK would silently drop or require a separate UUID surrogate column.

**Resolution:** `employer_users.employer_id` MUST be `TEXT`, not `UUID`. This matches the existing schema and requires no data migration. The migration is:

```sql
-- 0007_employer_product.sql (public schema section)
CREATE TABLE IF NOT EXISTS public.employer_users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  employer_id TEXT NOT NULL,  -- FK to wind_turbine.employers.id (TEXT PK)
  niche       TEXT NOT NULL,  -- which niche schema, e.g. 'wind_turbine'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(auth_id, employer_id, niche)
);
```

The `niche` column is required for multi-niche support — a user may claim an employer in niche A, but not niche B. The Auth Hook looks up all rows for `auth_id` and injects the `employer_id` for the matching niche into the JWT claims. [VERIFIED: 0001_initial.sql, schema types]

### Critical Finding 2: `@supabase/ssr` Not Installed

`apps/web/package.json` does NOT contain `@supabase/ssr`. CLAUDE.md mandates `@supabase/ssr ^0.10.0`. Wave 0 must install it. Current version: `0.10.3`. [VERIFIED: npm registry, package.json inspection]

```bash
pnpm add @supabase/ssr@^0.10.0 --filter @owljobs/web
```

### Critical Finding 3: Wrong `featured_until` Partial Index

Migration `0001_initial.sql` line 51-53 creates:
```sql
CREATE INDEX IF NOT EXISTS idx_jobs_featured
  ON wind_turbine.jobs(featured_until, posted_at DESC)
  WHERE is_sponsored = TRUE;
```

The FEAT-01 requirement says the index should support `WHERE featured_until > NOW()`, not `WHERE is_sponsored = TRUE`. The current index will NOT be used by the featured query pattern (D-12). Migration 0007 must drop and replace it:

```sql
DROP INDEX IF EXISTS wind_turbine.idx_jobs_featured;
CREATE INDEX idx_jobs_featured_active
  ON wind_turbine.jobs(featured_until DESC, posted_at DESC)
  WHERE featured_until > NOW();
```

Note: Postgres partial indexes with `NOW()` are not supported (NOW() is not immutable). The correct approach is a plain index without the partial predicate, with the `WHERE featured_until > NOW()` in the query itself:

```sql
DROP INDEX IF EXISTS wind_turbine.idx_jobs_featured;
CREATE INDEX idx_jobs_featured
  ON wind_turbine.jobs(featured_until DESC NULLS LAST, posted_at DESC)
  WHERE featured_until IS NOT NULL;
```
[VERIFIED: 0001_initial.sql, Postgres partial index constraints — ASSUMED for correct index shape]

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Employer profile page (public) | Frontend Server (SSR) | Database | SSR Astro page; reads from Supabase anon key |
| Claim flow (email submit) | API / Backend (Pages Function) | Database | Domain match check requires service key; can't run in browser |
| Magic-link auth | API / Backend (Supabase Auth) | Frontend Server | Supabase Auth service sends email; callback handled in Pages Function |
| JWT claim injection (employer_id) | Database (Supabase Auth Hook) | — | Postgres function runs in Supabase on token issue |
| Dashboard (protected) | Frontend Server (SSR) | API / Backend | SSR page checks session cookie; redirects if missing |
| Event tracking (view, apply-click) | API / Backend (Pages Function) | CF Analytics Engine | Server-side write prevents ad-blocker bypass; redirects after write |
| Dashboard stats query | API / Backend (Pages Function) | CF Analytics Engine SQL API | Queries CF API server-side; returns aggregated JSON to dashboard |
| Featured job toggle | API / Backend (Pages Function) | Database | Writes `featured_until` with service key; RLS enforced |
| SEO landing pages | Frontend Server (SSR) | Database | SSR Astro page; niche config drives content |
| Candidate match alerts (ANLYT-02) | Cloudflare Worker (digest) | Database + Resend | Cron → Queue → consumer; reuses existing worker |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/ssr` | ^0.10.0 | SSR-safe Supabase client with cookie session management | CLAUDE.md hard rule; v0.10+ fixes CDN session cross-contamination |
| `@supabase/supabase-js` | ^2.47.10 (installed) | Supabase client (data + auth) | Already in use |
| Cloudflare Analytics Engine | built-in binding | Event tracking | Edge-native, no DB writes per event, free tier generous |
| logo.dev | REST API (no SDK) | Employer logo auto-fetch by domain | Purpose-built logo API; no npm package |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `dompurify` | N/A | HTML sanitization | NOT needed in Phase 4 — profile editing is locked (D-06). Install deferred to Phase 5 when editing is unlocked. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| CF Analytics Engine | Supabase `job_events` table | Table approach: simpler querying, but adds DB write per page view — high frequency, wrong tier for this event class |
| Extend workers/digest (ANLYT-02) | New workers/employer-alerts worker | New worker adds deployment complexity; digest worker already has all needed patterns (Cron→Queue→Resend, niche scoping, Supabase) |

**Installation (Wave 0):**
```bash
pnpm add @supabase/ssr@^0.10.0 --filter @owljobs/web
```

**Version verification:** [VERIFIED: npm registry — @supabase/ssr@0.10.3 published 2025-12-10, @supabase/supabase-js@2.105.4 installed]

---

## Architecture Patterns

### System Architecture Diagram

```
[Browser]
    │ GET /employers/[slug]
    ▼
[Astro SSR Page]──────────────────────────────────────────────┐
    │ reads session cookie                                      │
    │ supabase.schema(niche.supabaseSchema)                    │
    │   .from("employers").eq("normalized_name", slug)         │
    │   ← employer + featured jobs (featured_until > NOW())    │
    │   ← regular jobs                                         │
    └─[renders EmployerLogo + ClaimListingCTA]                 │
                                                               │ employer views event
[Employer clicks "Claim this listing"]                        ▼
    │                                              [writeDataPoint → AE dataset]
    │ POST /api/employer/claim {email}
    ▼
[Pages Function: /api/employer/claim]
    ├─ validate email format
    ├─ extract domain from email
    ├─ supabaseAdmin().from("employers").eq("domain", domain)  ← service key
    │  └─ if match: supabase.auth.admin.generateLink({type:"magiclink", email})
    │              insert employer_users row (auth_id placeholder until callback)
    └─ redirect → /auth/check-email

[Email] → employer clicks magic link
    │
    ▼
[Pages Function: /auth/callback?code=...]
    ├─ createServerClient(@supabase/ssr)
    ├─ exchangeCodeForSession(code)
    ├─ session.user.app_metadata.employer_id ← injected by Auth Hook
    └─ redirect → /dashboard

[/dashboard (SSR, protected)]
    │ reads session from cookie (createServerClient)
    │ if no session → redirect /login
    │ employer_id from JWT claim
    ├─ fetch /api/stats?employer_id=X  (30-day AE stats)
    └─ db.from("jobs").eq("employer_id", employer_id) ← RLS enforces

[/api/stats Pages Function]
    └─ POST https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/analytics_engine/sql
       Authorization: Bearer {CF_API_TOKEN}
       SQL: SELECT blob1 AS job_id, blob2 AS event_type,
                   SUM(_sample_interval) AS count
            FROM owljobs_events
            WHERE timestamp >= NOW() - INTERVAL '30' DAY
              AND blob3 = {employer_id}
            GROUP BY blob1, blob2

[/api/jobs/[id]/featured Pages Function]
    ├─ verify session (employer_id matches job.employer_id)
    ├─ toggle: UPDATE jobs SET featured_until = NOW() + INTERVAL '30 days' OR NULL
    └─ 200 JSON

[/api/track?job=X&type=apply Pages Function]
    ├─ env.ANALYTICS.writeDataPoint({blobs:[jobId, "apply_click", employerId], ...})
    └─ Response.redirect(applyUrl, 302)
```

### Recommended Project Structure (additions only)

```
apps/web/src/
├── pages/
│   ├── login.astro                          # Magic-link login form
│   ├── dashboard.astro                      # Protected dashboard (SSR)
│   ├── [landingSlug].astro                  # SEO landing pages (runtime whitelist)
│   ├── auth/
│   │   ├── callback.astro                   # PKCE code exchange
│   │   └── check-email.astro               # Post-magic-link confirmation
│   └── api/
│       ├── employer/
│       │   └── claim.ts                     # POST: domain match + magic link send
│       ├── jobs/
│       │   └── [id]/
│       │       └── featured.ts              # POST/DELETE: toggle featured_until
│       ├── stats.ts                         # GET: AE SQL API proxy (30-day stats)
│       └── track.ts                         # GET: event write + redirect to ATS URL
├── components/
│   ├── employer/
│   │   ├── ClaimListingCTA.astro
│   │   ├── ClaimListingModal.astro
│   │   └── EmployerLogo.astro
│   ├── auth/
│   │   ├── MagicLinkForm.astro
│   │   └── CheckEmailNotice.astro
│   ├── dashboard/
│   │   ├── DashboardLayout.astro
│   │   ├── DashboardNav.astro
│   │   ├── StatTile.astro
│   │   ├── JobRow.astro
│   │   ├── FeaturedToggle.astro
│   │   ├── LockedFeatureCard.astro
│   │   ├── ProfileEditorPreview.astro
│   │   ├── LogoUploadPreview.astro
│   │   └── SubscriberMatchCard.astro
│   └── landing/
│       └── SeoIntroBlock.astro
└── lib/
    └── supabase.ts                          # extend: add createServerClient() with @supabase/ssr

packages/niches/src/index.ts               # extend NicheConfig with landingPages + seoFooter
niches/wind-turbine.ts                     # add landingPages[] + seoFooter
packages/schema/src/migrations/
└── 0007_employer_product.sql              # employer_users table, employers.domain, index fix, RLS, Auth Hook
```

### Pattern 1: Supabase SSR Server Client (magic-link auth)

`@supabase/ssr` provides `createServerClient` which manages session cookies automatically in SSR contexts. The existing `supabase.ts` only has `supabasePublic` and `supabaseAdmin`. A new `createSupabaseServerClient(cookies)` must be added for authenticated routes.

```typescript
// apps/web/src/lib/supabase.ts — add this function
import { createServerClient } from "@supabase/ssr";
import type { AstroCookies } from "astro";

export function createSupabaseServerClient(cookies: AstroCookies, env: { SUPABASE_URL: string; SUPABASE_ANON_KEY: string }) {
  return createServerClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookies.headers().split(";").map((c) => {
          const [name, ...rest] = c.trim().split("=");
          return { name: name!, value: rest.join("=") };
        });
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          cookies.set(name, value, options)
        );
      },
    },
  });
}
```

Note: The cookie adapter shape for `@supabase/ssr` with Astro requires `getAll()` / `setAll()` (not the legacy `get`/`set`/`remove`). This is the v0.10 shape. [CITED: supabase.com/docs/guides/auth/quickstarts/astrojs]

### Pattern 2: Auth Callback (PKCE code exchange)

```typescript
// apps/web/src/pages/auth/callback.astro (script frontmatter)
import { createSupabaseServerClient } from "../../lib/supabase.js";

const supabase = createSupabaseServerClient(Astro.cookies, getEnv(Astro.locals));
const code = Astro.url.searchParams.get("code");
if (code) {
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return Astro.redirect("/auth/error");
}
return Astro.redirect("/dashboard");
```

[CITED: supabase.com/docs/reference/javascript/auth-exchangecodeforsession]

### Pattern 3: Supabase Auth Hook (employer_id JWT claim)

The Auth Hook is a Postgres function registered in the Supabase dashboard under Authentication > Hooks. It runs on every token issue (login, refresh).

```sql
-- Part of 0007_employer_product.sql
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  claims JSONB;
  emp_id TEXT;
  niche_name TEXT;
BEGIN
  claims := event->'claims';

  -- Look up employer_id for this auth user
  SELECT eu.employer_id, eu.niche
    INTO emp_id, niche_name
    FROM public.employer_users eu
   WHERE eu.auth_id = (event->>'user_id')::UUID
   LIMIT 1;

  IF emp_id IS NOT NULL THEN
    claims := jsonb_set(claims, '{app_metadata}',
      COALESCE(claims->'app_metadata', '{}') ||
      jsonb_build_object('employer_id', emp_id, 'employer_niche', niche_name)
    );
    event := jsonb_set(event, '{claims}', claims);
  END IF;

  RETURN event;
END;
$$;

-- Required permissions
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;
```

In Astro pages, access the claim as:
```typescript
const session = await supabase.auth.getSession();
const employer_id = session.data.session?.user?.app_metadata?.employer_id as string | undefined;
```

[CITED: supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook]

### Pattern 4: Analytics Engine — Write (Pages Function)

```typescript
// apps/web/src/pages/api/track.ts
export const GET: APIRoute = ({ locals, url, redirect }) => {
  const env = getEnv(locals);
  const jobId = url.searchParams.get("job") ?? "";
  const eventType = url.searchParams.get("type") ?? "view";
  const employerId = url.searchParams.get("employer") ?? "";

  // Fire-and-forget — no await
  (env as any).ANALYTICS.writeDataPoint({
    blobs: [jobId, eventType, employerId],  // blob1=job_id, blob2=event_type, blob3=employer_id
    doubles: [1],                            // double1=count (always 1; sum in SQL)
    indexes: [jobId],                        // sampling key = job_id
  });

  const applyUrl = url.searchParams.get("redirect") ?? "/jobs";
  return redirect(applyUrl, 302);
};
```

[VERIFIED: developers.cloudflare.com/analytics/analytics-engine/get-started/ via WebSearch]

### Pattern 5: Analytics Engine — Query (SQL API)

```typescript
// apps/web/src/pages/api/stats.ts
export const GET: APIRoute = async ({ locals, url }) => {
  const employerId = url.searchParams.get("employer_id") ?? "";
  const env = getEnv(locals) as any;

  const sql = `
    SELECT blob1 AS job_id,
           blob2 AS event_type,
           SUM(_sample_interval) AS count
    FROM owljobs_events
    WHERE timestamp >= NOW() - INTERVAL '30' DAY
      AND blob3 = '${employerId}'
    GROUP BY blob1, blob2
    FORMAT JSON
  `;

  const resp = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.CF_API_TOKEN}`,
        "Content-Type": "text/plain",
      },
      body: sql,
    }
  );

  if (!resp.ok) return new Response(JSON.stringify({ error: "stats unavailable" }), { status: 200 });
  const data = await resp.json();
  return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
};
```

Required new secrets in `apps/web/wrangler.toml` and `.dev.vars`:
- `CF_ACCOUNT_ID` — Cloudflare account ID (32-char)
- `CF_API_TOKEN` — token with Analytics Engine Read permission

[VERIFIED: developers.cloudflare.com/analytics/analytics-engine/sql-api/ via WebSearch]

### Pattern 6: Analytics Engine — wrangler.toml Binding

```toml
# apps/web/wrangler.toml — add after existing secrets comment block
[[analytics_engine_datasets]]
binding = "ANALYTICS"
dataset = "owljobs_events"
```

Dataset is created automatically on first write. Pages Functions access it as `env.ANALYTICS` (same as Workers). [VERIFIED: developers.cloudflare.com/analytics/analytics-engine/get-started/]

### Pattern 7: SEO Landing Pages (Astro routing)

**Do NOT use `[...path].astro`** — it causes a known conflict with Astro server islands (Issue #11793 on withastro/astro). Use a single-segment `[landingSlug].astro` at the root level.

```typescript
// apps/web/src/pages/[landingSlug].astro
---
const { niche } = Astro.locals;
const { landingSlug } = Astro.params;

// Runtime whitelist — only serve pages in the niche config
const page = niche.landingPages?.find((p) => p.slug === landingSlug);
if (!page) return Astro.redirect("/404");

// Build keyword prefix: "${niche.id}-jobs" e.g. "wind-turbine-jobs"
// Validates that landingSlug starts with the niche prefix for safety
const expectedPrefix = `${niche.id}-jobs`;
if (!landingSlug.startsWith(expectedPrefix)) return Astro.redirect("/404");
---
```

Single-segment routes don't conflict with `/login`, `/dashboard`, `/auth/*` (those are more specific). The `_server-islands/*` path is multi-segment and won't match. [VERIFIED: Astro routing docs, withastro/astro Issue #11793]

### Pattern 8: `NicheConfig` Type Extension

Two new fields needed (both optional, backward-compatible):

```typescript
// packages/niches/src/index.ts — add to NicheConfig interface
export interface LandingPage {
  slug: string;          // e.g. "wind-turbine-jobs-austin-tx"
  label: string;         // e.g. "Austin, TX"
  filters: {
    keywords?: string[];
    location?: string;
  };
}

export interface NicheConfig {
  // ... existing fields ...
  landingPages?: LandingPage[];
  seoFooter?: string;    // Template paragraph for SEO footer on landing pages
}
```

The `landingSlug` prefix rule: URL prefix is `${niche.id}-jobs` (e.g. `wind-turbine` → `wind-turbine-jobs`). Do NOT add an explicit `jobKeywordSlug` field — derivation is unambiguous. [ASSUMED: derivation rule is correct for all future niches]

### Pattern 9: Multi-Niche RLS for Employer Dashboard

The Auth Hook injects `employer_id` (TEXT) + `employer_niche` into `app_metadata`. RLS policies on per-niche tables use the JWT claim:

```sql
-- In 0007_employer_product.sql (per-niche section — uses «wind_turbine» substitution token)

-- Employers: owner can see their own row
CREATE POLICY employer_self_read ON wind_turbine.employers FOR SELECT TO authenticated
  USING (id = (auth.jwt() ->> 'employer_id'));

-- Jobs: employer can read all their own jobs (including expired)
CREATE POLICY employer_jobs_read ON wind_turbine.jobs FOR SELECT TO authenticated
  USING (employer_id = (auth.jwt() ->> 'employer_id'));

-- Jobs: employer can update their own jobs (featured_until toggle only — app enforces column restriction)
CREATE POLICY employer_jobs_update ON wind_turbine.jobs FOR UPDATE TO authenticated
  USING (employer_id = (auth.jwt() ->> 'employer_id'))
  WITH CHECK (employer_id = (auth.jwt() ->> 'employer_id'));
```

Note: `auth.jwt()` returns the raw JWT claims object. The `employer_id` claim lives in `app_metadata`, which Supabase flattens into the top-level JWT for RLS use. Verify this behavior in testing — the exact path may be `auth.jwt()->>'app_metadata'->>'employer_id'` vs `auth.jwt()->>'employer_id'`. [ASSUMED: Supabase flattens app_metadata into top-level JWT claims for RLS — verify in testing]

### Pattern 10: ANLYT-02 — Extend workers/digest

Add a second handler to `workers/digest/src/index.ts`:

```typescript
// New cron trigger: Monday 06:00 UTC — "0 6 * * 1"
// New queue: owljobs-employer-alerts (max_batch_size: 2)
// New consumer: reads employer_users, counts new subscribers since last Monday,
//               sends email via Resend to employer.billing_email
```

In `workers/digest/wrangler.toml`:
```toml
[[triggers.crons]]
cron = "0 6 * * 1"   # Add to existing crons array

[[queues.producers]]
queue = "owljobs-employer-alerts"
binding = "EMPLOYER_ALERTS"

[[queues.consumers]]
queue = "owljobs-employer-alerts"
max_batch_size = 2
```

The consumer queries `wind_turbine.subscribers` for `confirmed_at >= NOW() - INTERVAL '7 days'` count, then sends to each employer's `billing_email`. Uses existing `supabaseAdmin()` + Resend pattern. [ASSUMED: workers/digest wrangler.toml supports multiple cron triggers — verify]

### Anti-Patterns to Avoid

- **`[...path].astro` catch-all for landing pages:** Conflicts with `_server-islands/*` in production builds. Use single-segment `[landingSlug].astro` with runtime whitelist.
- **Client-side event tracking:** Ad-blockers will suppress client-side `fetch()` to Analytics Engine. All writes go through server-side Pages Functions only (D-10).
- **`sanitize-html` for HTML sanitization:** Node.js only — not compatible with Workers/Pages. Use `dompurify` in no-DOM mode. (Phase 4: moot since editing is locked, but do not accidentally install sanitize-html.)
- **`constructEvent` for Stripe (carry-forward):** Not applicable to Phase 4, but do not import it if Stripe code is touched.
- **Awaiting `writeDataPoint()`:** It returns immediately; awaiting it is a no-op but adds latency. Do not await.
- **Hardcoding `employer_id` as UUID:** The existing `employers.id` is TEXT (SHA-256 hash). The join table `employer_users.employer_id` must also be TEXT.
- **Using `sync constructEvent` for Stripe:** Not Phase 4 but worth carrying the warning — do not touch Stripe code in this phase.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Employer logo auto-fetch | Custom logo scraper | logo.dev REST API | Purpose-built; handles domain → logo lookup, CDN, fallbacks |
| Session cookie management | Manual cookie parsing | `@supabase/ssr createServerClient` | v0.10+ handles PKCE, token refresh, cross-CDN safety |
| HTML sanitization (Phase 5) | Regex strip | `dompurify` (Workers no-DOM mode) | Regex strips are bypassable; not needed in Phase 4 |
| Event data storage | Supabase `job_events` table | CF Analytics Engine | Table adds DB write per page view — use Analytics Engine for high-frequency event data |
| JWT claim injection | Manual claim decode | Supabase Auth Hook (Postgres function) | Hook runs server-side in Supabase, no client bypass possible |

---

## Common Pitfalls

### Pitfall 1: `employer_id` Type Assumption
**What goes wrong:** Developer writes `employer_users.employer_id UUID` assuming employer IDs are UUIDs. FK to `wind_turbine.employers.id TEXT` fails at migration time.
**Why it happens:** D-03 said UUID without consulting the schema.
**How to avoid:** Use `TEXT` for `employer_users.employer_id`. See Critical Finding 1.
**Warning signs:** Migration fails with `type mismatch` or FK constraint error.

### Pitfall 2: Supabase Auth Hook Path for `employer_id` in RLS
**What goes wrong:** RLS policy uses `auth.jwt()->>'employer_id'` but the claim is nested in `app_metadata`, so the expression returns NULL for all rows.
**Why it happens:** Supabase's JWT flattening behavior is version-dependent.
**How to avoid:** Test the RLS expression in Supabase SQL Editor with `SELECT auth.jwt();` after logging in. If it returns `{"app_metadata": {"employer_id": "..."}}`, use `auth.jwt()->'app_metadata'->>'employer_id'`. [ASSUMED: exact path requires runtime verification]
**Warning signs:** Dashboard shows employer's own jobs as empty even though jobs exist.

### Pitfall 3: `@supabase/ssr` Cookie Adapter Shape
**What goes wrong:** Using the legacy `get`/`set`/`remove` cookie shape from pre-v0.10 examples. Current v0.10 requires `getAll()`/`setAll()`.
**Why it happens:** Old blog posts and the Astro quickstart lagged the API change.
**How to avoid:** Use the `getAll`/`setAll` shape shown in Pattern 1 above. [CITED: supabase.com/docs/guides/auth/quickstarts/astrojs]
**Warning signs:** Session not persisting across page loads; user is always logged out.

### Pitfall 4: Analytics Engine writeDataPoint in Local Dev
**What goes wrong:** `env.ANALYTICS.writeDataPoint is not a function` errors during `astro dev`.
**Why it happens:** Analytics Engine binding is not simulated by the local Wrangler dev server (known issue: cloudflare/workers-sdk#4258).
**How to avoid:** Guard with `if (env.ANALYTICS) env.ANALYTICS.writeDataPoint(...)` for local dev. Events are silently dropped locally; this is acceptable. Deploy to Pages preview for end-to-end testing.
**Warning signs:** `TypeError: env.ANALYTICS.writeDataPoint is not a function` during `pnpm dev`.

### Pitfall 5: SEO Landing Page Slug Collision with Static Routes
**What goes wrong:** `[landingSlug].astro` matches `/login`, `/dashboard`, `/404`, etc. before the static pages are resolved.
**Why it happens:** Astro route priority: more-specific static routes always win over dynamic `[param]` routes. This is correct behavior, but developers sometimes add a defensive `if (slug === 'login') return 404` check unnecessarily.
**How to avoid:** Static pages (`login.astro`, `dashboard.astro`) always take priority. Only add the whitelist check against `niche.landingPages` to return 404 for unknown slugs.
**Warning signs:** N/A — this pitfall produces no errors; mentioning it to prevent unnecessary guard code.

### Pitfall 6: Analytics Engine SQL API — Account ID and API Token as Secrets
**What goes wrong:** `CF_ACCOUNT_ID` and `CF_API_TOKEN` not added to Pages secrets; stats API returns 401.
**Why it happens:** These are not in the existing `CloudflareEnv` type or `.dev.vars` template.
**How to avoid:** Wave 0 must add both to `env.d.ts` (`CloudflareEnv` type), `apps/web/wrangler.toml` secrets comment, and `.dev.vars`. Token needs `Analytics Engine Read` permission scope.
**Warning signs:** `/api/stats` returns empty or 401 response; dashboard stats show `—`.

### Pitfall 7: `featured_until` Index Is Wrong (Migration Required)
**What goes wrong:** Featured jobs query runs a full table scan because the existing index has `WHERE is_sponsored = TRUE` partial predicate, not `WHERE featured_until IS NOT NULL`.
**Why it happens:** 0001_initial.sql was written before the featured query pattern was finalized.
**How to avoid:** Drop and recreate in migration 0007. See Critical Finding 3.
**Warning signs:** Slow response on `/jobs/index.astro` when featured jobs exist; query plan shows Seq Scan.

---

## Code Examples

### Claim Flow — Domain Match and Magic Link Send

```typescript
// apps/web/src/pages/api/employer/claim.ts
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const env = getEnv(locals);
  const { email } = await request.json();

  // Extract domain
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return new Response("Invalid email", { status: 400 });

  const db = supabaseAdmin(env);
  const niche = locals.niche;

  // Find employer by domain
  const { data: employer } = await db
    .schema(niche.supabaseSchema)
    .from("employers")
    .select("id, name")
    .eq("domain", domain)
    .single();

  if (!employer) {
    return new Response(
      JSON.stringify({ error: "domain_mismatch" }),
      { status: 422 }
    );
  }

  // Send magic link via Supabase Auth
  const { error } = await db.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `https://${niche.domain}/auth/callback` },
  });
  if (error) return new Response(JSON.stringify({ error: "send_failed" }), { status: 500 });

  return redirect("/auth/check-email", 302);
};
```

### Featured Toggle

```typescript
// apps/web/src/pages/api/jobs/[id]/featured.ts
export const POST: APIRoute = async ({ params, locals }) => {
  const env = getEnv(locals) as any;
  const supabase = createSupabaseServerClient(/* cookies from context */, env);
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const employer_id = session.user.app_metadata.employer_id;
  const db = supabaseAdmin(env);
  const niche = locals.niche;

  const { error } = await db
    .schema(niche.supabaseSchema)
    .from("jobs")
    .update({ featured_until: new Date(Date.now() + 30 * 86400 * 1000).toISOString() })
    .eq("id", params.id!)
    .eq("employer_id", employer_id);  // belt-and-suspenders auth check

  if (error) return new Response(JSON.stringify({ error }), { status: 500 });
  return new Response(JSON.stringify({ ok: true }));
};
```

### logo.dev `EmployerLogo.astro` (onerror pattern)

```astro
---
// apps/web/src/components/employer/EmployerLogo.astro
interface Props {
  domain: string | null;
  name: string;
  size?: "sm" | "md" | "lg";  // sm=40px, md=48px, lg=56px
}
const { domain, name, size = "md" } = Astro.props;
const sizeMap = { sm: "h-10 w-10", md: "h-12 w-12", lg: "h-14 w-14" };
const px = { sm: 40, md: 48, lg: 56 };
const initials = name.split(/\s+/).filter(Boolean).map(w => w[0]).join("").slice(0, 2).toUpperCase();
const logoUrl = domain
  ? `https://img.logo.dev/${domain}?token=${import.meta.env.LOGODEV_TOKEN ?? ""}&size=120&format=png`
  : null;
---
<div class={`relative shrink-0 ${sizeMap[size]}`} aria-label={`${name} logo`}>
  {logoUrl && (
    <img
      src={logoUrl}
      alt={name}
      width={px[size]}
      height={px[size]}
      class={`rounded-lg object-contain ${sizeMap[size]}`}
      onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"
    />
  )}
  <div
    class={`${sizeMap[size]} ${logoUrl ? "hidden" : "flex"} items-center justify-center rounded-lg border border-border bg-secondary text-sm font-semibold text-muted-foreground`}
  >
    {initials}
  </div>
</div>
```

`LOGODEV_TOKEN` is a publishable key (safe in client-rendered HTML). Store as Pages secret. [VERIFIED: logo.dev docs — token is publishable-key type, safe for frontend use]

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@supabase/ssr` `get`/`set`/`remove` cookie API | `getAll`/`setAll` cookie API | v0.10.0 | Old examples (pre-2024) fail silently — session not saved |
| `supabase.auth.signIn()` | `supabase.auth.signInWithOtp()` | 2022 | `signIn()` removed |
| Manual JWT decode for claims | Supabase Auth Hook (Postgres function) | 2024 | Hook is the official pattern; `app_metadata` injection is stable |
| CF Analytics Engine private beta | GA (no waitlist) | 2023 | No activation needed; binding works immediately on plan |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `${niche.id}-jobs` prefix correctly derives landing page URL prefix for all future niches | Architecture Patterns (Pattern 8) | A niche with a non-hyphenated ID or different URL convention would need an explicit field |
| A2 | Supabase flattens `app_metadata` into top-level JWT for RLS (`auth.jwt()->>'employer_id'` works) | Architecture Patterns (Pattern 9) | RLS policies silently fail; dashboard shows empty job list |
| A3 | workers/digest wrangler.toml supports multiple cron triggers | Architecture Patterns (Pattern 10) | Need to verify actual wrangler.toml structure before implementing ANLYT-02 |
| A4 | Postgres partial index `WHERE featured_until IS NOT NULL` is more useful than `WHERE featured_until > NOW()` (which is immutable-expression-restricted) | Critical Finding 3 | Index still created but won't be used if optimizer chooses differently |
| A5 | logo.dev token is a publishable key (safe to embed in HTML/SSR output) | Code Examples | If token is secret, must proxy logo requests through a Pages Function |

---

## Open Questions

1. **Supabase Auth Hook: `app_metadata` JWT path for RLS**
   - What we know: Hook sets `app_metadata.employer_id`; RLS needs to read it
   - What's unclear: Whether Supabase exposes it as `auth.jwt()->>'employer_id'` (flattened) or `auth.jwt()->'app_metadata'->>'employer_id'` (nested)
   - Recommendation: Add a Wave 0 verification step — run `SELECT auth.jwt();` in Supabase SQL Editor with a test employer session; confirm the exact path before writing RLS policies

2. **ANLYT-02: workers/digest cron compatibility**
   - What we know: The digest worker has one cron (`0 6 * * MON`); the employer alert also needs Monday 06:00 UTC
   - What's unclear: Whether to add a second distinct cron or reuse the same one and branch on payload; and whether the same queue can serve both functions
   - Recommendation: Same trigger time is fine — add a second cron `"0 6 * * 1"` (triggers two separate events) or use one cron that enqueues both digest and alert jobs with a `type` field

3. **CF_API_TOKEN scope for Analytics Engine SQL API**
   - What we know: The SQL API requires `Authorization: Bearer {token}` with Analytics Engine Read permission
   - What's unclear: Whether an existing Workers API token can be reused or a dedicated token is needed
   - Recommendation: Create a dedicated token with `Analytics Engine Read` scope only (principle of least privilege); document in Wave 0 setup

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `@supabase/ssr` | PROF-03, all auth | NOT INSTALLED | — | None — must install |
| Cloudflare Analytics Engine | ANLYT-01 | Available (GA) | N/A (binding) | None — required by D-09 |
| logo.dev API token | PROF-01 | Unknown | — | Initials fallback (already implemented) |
| CF_ACCOUNT_ID + CF_API_TOKEN | ANLYT-01 (stats query) | Not in secrets | — | Dashboard shows `—` gracefully |
| Supabase Auth Hook (configuration) | PROF-03, D-04 | Not configured | — | No employer_id claim; dashboard auth breaks |

**Missing dependencies with no fallback:**
- `@supabase/ssr` — must install in Wave 0
- Supabase Auth Hook — must configure in Supabase dashboard after migration 0007 is applied

**Missing dependencies with fallback:**
- logo.dev token — graceful initials fallback already implemented
- CF_ACCOUNT_ID / CF_API_TOKEN — dashboard stats show `—` (graceful error state per UI-SPEC)

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.x |
| Config file | `apps/web/vitest.config.ts` (check if exists; may need creating) |
| Quick run command | `pnpm --filter @owljobs/web test` |
| Full suite command | `pnpm --filter @owljobs/web test --run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PROF-01 | `EmployerLogo` renders logo.dev URL when domain present, initials when null | unit | `pnpm test -- EmployerLogo` | ❌ Wave 0 |
| PROF-02 | Claim API returns 422 on domain mismatch, sends magic link on match | unit | `pnpm test -- claim` | ❌ Wave 0 |
| PROF-03 | Auth callback exchanges code for session, redirects to /dashboard | integration | Manual (requires Supabase) | ❌ Wave 0 |
| FEAT-01 | `listFeaturedJobs()` query returns only jobs with `featured_until > NOW()` | unit | `pnpm test -- jobs` | ❌ Wave 0 |
| FEAT-02 | `FeaturedJobCard` renders "Featured" badge | unit | Visual / existing component | ❌ |
| FEAT-03 | Featured toggle API sets `featured_until = NOW() + 30d` | unit | `pnpm test -- featured` | ❌ Wave 0 |
| ANLYT-01 | Stats API returns aggregated counts per job from Analytics Engine | integration | Manual (requires CF binding) | ❌ |
| ANLYT-02 | Employer alert consumer sends correct subscriber count per employer | unit | `pnpm test -- employer-alert` | ❌ Wave 0 |

### Wave 0 Gaps
- [ ] `apps/web/test/claim.test.ts` — covers PROF-02
- [ ] `apps/web/test/jobs.test.ts` — covers FEAT-01 (extend existing or create)
- [ ] `apps/web/test/featured.test.ts` — covers FEAT-03
- [ ] `apps/web/test/employer-logo.test.ts` — covers PROF-01
- [ ] `workers/digest/test/employer-alert.test.ts` — covers ANLYT-02

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Supabase magic-link OTP; `@supabase/ssr` session cookies |
| V3 Session Management | yes | `@supabase/ssr` HttpOnly cookies; PKCE code exchange |
| V4 Access Control | yes | Supabase RLS on `employer_id` JWT claim; service key for writes |
| V5 Input Validation | yes | Email format validation in claim form; domain extraction server-side |
| V6 Cryptography | no | Not hand-rolling; Supabase and CF handle crypto |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Claim spoofing (fake domain) | Spoofing | Server-side domain extraction from email (not user-provided) |
| JWT claim bypass | Elevation of Privilege | RLS enforced at DB level; `employer_id` from Auth Hook, not client |
| Featured toggle IDOR (toggle another employer's job) | Tampering | API checks `employer_id` match before UPDATE; belt-and-suspenders with RLS |
| Analytics Engine injection via job_id in SQL | Tampering | Use parameterized approach or sanitize `employer_id` before embedding in SQL string |
| Session fixation | Tampering | `exchangeCodeForSession` + PKCE prevents; user must click the emailed link from same browser |

**SQL injection note for Analytics Engine:** The SQL API is a raw HTTP POST with string interpolation (no parameterized queries in CF Analytics Engine SQL). Sanitize `employer_id` (validate it matches a known TEXT pattern — SHA-256 hex string = 64 hex chars) before embedding in the SQL query string. [ASSUMED: CF Analytics Engine SQL API does not support parameterized queries — verify at implementation time]

---

## Sources

### Primary (HIGH confidence)
- `apps/web/package.json` — installed dependencies, confirmed @supabase/ssr absent
- `packages/schema/src/migrations/0001_initial.sql` — `employers.id TEXT`, `featured_until`, index definition
- `packages/niches/src/index.ts` — `NicheConfig` type, no `landingPages` field
- `apps/web/src/lib/supabase.ts` — existing patterns, confirmed no createServerClient
- `apps/web/wrangler.toml` — confirmed no `analytics_engine_datasets` binding
- npm registry — @supabase/ssr@0.10.3 confirmed latest

### Secondary (MEDIUM confidence)
- [CF Analytics Engine get-started](https://developers.cloudflare.com/analytics/analytics-engine/get-started/) — binding config, writeDataPoint signature
- [CF Analytics Engine SQL API](https://developers.cloudflare.com/analytics/analytics-engine/sql-api/) — endpoint, auth, query format
- [Supabase Custom Access Token Hook](https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook) — Postgres function hook pattern
- [Supabase SSR Astro quickstart](https://supabase.com/docs/guides/auth/quickstarts/astrojs) — getAll/setAll cookie adapter
- [Supabase signInWithOtp](https://supabase.com/docs/reference/javascript/auth-signinwithotp) — emailRedirectTo, PKCE
- [logo.dev API](https://www.logo.dev/docs/logo-images/introduction) — URL format, token type
- withastro/astro Issue #11793 — `[...slug].astro` server-islands conflict

### Tertiary (LOW confidence — flag for validation)
- ANLYT-02 workers/digest extension approach — recommended based on existing patterns; verify wrangler.toml multi-cron support before planning task
- RLS `auth.jwt()->>'employer_id'` path — must be verified with live Supabase session

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified against installed packages and npm registry
- Architecture: HIGH — derived from verified codebase; migration types verified against schema
- Auth Hook pattern: MEDIUM — official docs cited; exact JWT path requires live verification
- Analytics Engine: HIGH — official CF docs for binding and SQL API
- Pitfalls: HIGH — Critical findings 1-3 are verified against actual migration files

**Research date:** 2026-05-12
**Valid until:** 2026-06-12 (30 days — Supabase SSR and CF Analytics Engine are stable)
