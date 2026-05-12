# Phase 4: Employer Product - Pattern Map

**Mapped:** 2026-05-12
**Files analyzed:** 28 new/modified files
**Analogs found:** 22 / 28

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `packages/schema/src/migrations/0007_employer_product.sql` | migration | CRUD | `packages/schema/src/migrations/0001_initial.sql` | exact |
| `packages/niches/src/index.ts` | config | — | self (extend) | exact |
| `niches/wind-turbine.ts` | config | — | self (extend) | exact |
| `apps/web/src/lib/supabase.ts` | utility | request-response | self (extend) | exact |
| `apps/web/src/lib/jobs.ts` | service | CRUD | self (extend) | exact |
| `apps/web/src/lib/env.ts` | config | — | self (extend) | exact |
| `apps/web/src/env.d.ts` | config | — | self (extend) | exact |
| `apps/web/wrangler.toml` | config | — | self (extend) | exact |
| `apps/web/src/middleware.ts` | middleware | request-response | self (extend) | exact |
| `apps/web/src/pages/employers/[slug].astro` | page | request-response | self (extend) | exact |
| `apps/web/src/pages/jobs/index.astro` | page | request-response | self (extend) | exact |
| `apps/web/src/pages/[landingSlug].astro` | page | request-response | `apps/web/src/pages/jobs/index.astro` | role-match |
| `apps/web/src/pages/dashboard.astro` | page | request-response | `apps/web/src/pages/jobs/[slug].astro` | role-match |
| `apps/web/src/pages/auth/callback.astro` | page | request-response | `apps/web/src/pages/jobs/[slug].astro` | partial-match |
| `apps/web/src/pages/api/claim.ts` | route | request-response | `apps/web/src/pages/api/subscribe.ts` | exact |
| `apps/web/src/pages/api/track.ts` | route | request-response | `apps/web/src/pages/api/confirm.ts` | exact |
| `apps/web/src/pages/api/stats.ts` | route | request-response | `apps/web/src/pages/api/confirm.ts` | role-match |
| `apps/web/src/components/EmployerLogo.astro` | component | — | `apps/web/src/pages/employers/[slug].astro` lines 43–72 | partial-match |
| `apps/web/src/components/ClaimListingCTA.astro` | component | — | `apps/web/src/components/Header.astro` | partial-match |
| `apps/web/src/components/MagicLinkForm.astro` | component | event-driven | `apps/web/src/components/Newsletter.astro` | exact |
| `apps/web/src/components/FeaturedJobCard.astro` | component | — | self (extend) | exact |
| `apps/web/src/components/SponsoredBadge.astro` | component | — | self (wire real data) | exact |
| `apps/web/src/components/dashboard/StatTile.astro` | component | — | `apps/web/src/components/ui/Card.astro` | partial-match |
| `apps/web/src/components/dashboard/JobRow.astro` | component | — | `apps/web/src/components/JobCardModern.astro` | role-match |
| `apps/web/src/components/dashboard/FeaturedToggle.astro` | component | event-driven | `apps/web/src/components/ui/Button.astro` | partial-match |
| `apps/web/src/components/dashboard/LockedFeatureCard.astro` | component | — | `apps/web/src/components/ui/Card.astro` | partial-match |
| `workers/digest/src/index.ts` | worker | event-driven | self (extend for ANLYT-02) | exact |
| `workers/digest/wrangler.toml` | config | — | self (extend) | exact |

---

## Pattern Assignments

### `packages/schema/src/migrations/0007_employer_product.sql` (migration, CRUD)

**Analog:** `packages/schema/src/migrations/0001_initial.sql`

**Header comment pattern** (lines 1–4):
```sql
-- OwlJobs niche schema — paste into Supabase SQL Editor.
-- Replace every occurrence of «wind_turbine» with your niche's schema name before running.
-- The provision script (pnpm niche:provision <id>) generates a pre-substituted copy.
```

**Table DDL pattern** (lines 10–22) — id TEXT PRIMARY KEY, TIMESTAMPTZ DEFAULT NOW(), nullable columns at end:
```sql
CREATE TABLE IF NOT EXISTS wind_turbine.employers (
  id            TEXT PRIMARY KEY,              -- sha256(normalize(name))
  name          TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Index pattern** (lines 51–53) — partial index with WHERE clause:
```sql
CREATE INDEX IF NOT EXISTS idx_jobs_featured
  ON wind_turbine.jobs(featured_until, posted_at DESC)
  WHERE is_sponsored = TRUE;
```

**Critical — migration 0007 must:**
1. Add `domain TEXT` to `wind_turbine.employers` (nullable, for domain-match claim flow)
2. Add `public.employer_users (auth_id UUID, employer_id TEXT)` join table — `employer_id` is TEXT (SHA-256), not UUID
3. Drop the broken `idx_jobs_featured` partial index (`WHERE is_sponsored = TRUE`) and recreate as `WHERE featured_until IS NOT NULL`
4. `featured_until` column already exists in `wind_turbine.jobs` (line 37 of 0001_initial.sql) — do NOT add it again
5. Use `public` schema for `employer_users` (not niche-scoped) — billing/auth is global per STATE.md

**Migration 0007 structure to follow:**
```sql
-- Phase 4: Employer Product
-- Adds: employers.domain, public.employer_users, fixes featured_until index

-- 1. Add domain column to employers (all niche schemas)
ALTER TABLE wind_turbine.employers ADD COLUMN IF NOT EXISTS domain TEXT;

-- 2. employer_users join table (public schema — global auth, not per-niche)
-- NOTE: auth_id is nullable here because at claim time the user hasn't authenticated yet.
-- The Auth Hook populates auth_id at first sign-in, or auth/callback.astro backfills it.
-- Planner must decide exact timing — see Critical Finding 4.
CREATE TABLE IF NOT EXISTS public.employer_users (
  auth_id     UUID    REFERENCES auth.users(id) ON DELETE CASCADE,  -- nullable until first login
  employer_id TEXT    NOT NULL,
  niche_id    TEXT    NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employer_id, niche_id)
);

-- 3. Fix featured index: was WHERE is_sponsored = TRUE, must be WHERE featured_until IS NOT NULL
DROP INDEX IF EXISTS wind_turbine.idx_jobs_featured;
CREATE INDEX IF NOT EXISTS idx_jobs_featured
  ON wind_turbine.jobs(featured_until DESC, posted_at DESC)
  WHERE featured_until IS NOT NULL;
```

---

### `packages/niches/src/index.ts` (config, extend)

**Analog:** self — extend existing `NicheConfig` interface

**Existing interface pattern** (lines 1–30 of packages/niches/src/index.ts):
```typescript
export interface NicheConfig {
  id: string;
  name: string;
  tagline: string;
  domain: string;
  supabaseSchema: string;
  atsTargets: AtsTarget[];
  branding: { primaryColor: string; logoUrl?: string };
}
```

**Add to NicheConfig:**
```typescript
export interface LandingPage {
  slug: string;    // e.g. "wind-turbine-jobs-austin-tx"
  label: string;   // e.g. "Austin, TX"
  filters: {
    keywords?: string[];
    location?: string;
  };
}

// In NicheConfig:
landingPages?: LandingPage[];
seoFooter?: string;  // Optional blurb for landing page footer
```

---

### `niches/wind-turbine.ts` (config, extend)

**Analog:** self — add `landingPages` array

**Existing export pattern** (file has windTurbine: NicheConfig object with all fields):
```typescript
const windTurbine: NicheConfig = {
  id: "wind-turbine",
  // ... existing fields ...
  landingPages: [
    { slug: "wind-turbine-jobs-austin-tx", label: "Austin, TX", filters: { location: "Austin" } },
    { slug: "wind-turbine-jobs-offshore-north-sea", label: "Offshore – North Sea", filters: { keywords: ["offshore"], location: "North Sea" } },
    { slug: "entry-level-wind-turbine-jobs", label: "Entry Level", filters: { keywords: ["entry level", "junior", "trainee"] } },
    { slug: "blade-repair-technician-jobs", label: "Blade Repair Technicians", filters: { keywords: ["blade repair", "blade technician"] } },
  ],
};
```

---

### `apps/web/src/lib/supabase.ts` (utility, extend)

**Analog:** self — add `createSupabaseServerClient`

**Existing factory pattern** (full file, 20 lines):
```typescript
import { createClient } from "@supabase/supabase-js";

export function supabasePublic(env: { SUPABASE_URL: string; SUPABASE_ANON_KEY: string }) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
}

export function supabaseAdmin(env: { SUPABASE_URL: string; SUPABASE_SERVICE_KEY: string }) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
}
```

**Add — SSR server client pattern** (from RESEARCH.md Pattern 1 — verbatim, no codebase analog exists yet):
```typescript
import { createServerClient, parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";

export function createSupabaseServerClient(
  env: { SUPABASE_URL: string; SUPABASE_ANON_KEY: string },
  cookieHeader: string | null,
  responseHeaders: Headers,
) {
  return createServerClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return parseCookieHeader(cookieHeader ?? "");
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          responseHeaders.append(
            "Set-Cookie",
            serializeCookieHeader(name, value, options),
          );
        }
      },
    },
  });
}
```

**Usage in .astro frontmatter:**
```typescript
const responseHeaders = new Headers();
const supabase = createSupabaseServerClient(
  getEnv(Astro.locals),
  Astro.request.headers.get("cookie"),
  responseHeaders,
);
const { data: { session } } = await supabase.auth.getSession();
// After rendering:
return Astro.response; // responseHeaders.set-cookie is handled by supabase client
```

---

### `apps/web/src/lib/jobs.ts` (service, CRUD, extend)

**Analog:** self — add `listFeaturedJobs()`

**Existing query pattern** (lines 1–40 of jobs.ts) — all queries use `db.schema(schema).from(...)`:
```typescript
export async function listJobs(env: CloudflareEnv, niche: NicheConfig, opts: ListJobsOpts = {}) {
  const db = supabasePublic(env);
  const q = db.schema(niche.supabaseSchema).from("jobs").select(...).eq("status", "active");
  // ... filters, order, range ...
  const { data, error } = await q;
  if (error) throw error;
  return data as JobListing[];
}
```

**Add `listFeaturedJobs()` — separate query, returns jobs WHERE featured_until > NOW():**
```typescript
export async function listFeaturedJobs(env: CloudflareEnv, niche: NicheConfig): Promise<JobListing[]> {
  const db = supabasePublic(env);
  const { data, error } = await db
    .schema(niche.supabaseSchema)
    .from("jobs")
    .select("id,title,employer_id,location,canonical_url,apply_url,featured_until,posted_at")
    .eq("status", "active")
    .gt("featured_until", new Date().toISOString())
    .order("featured_until", { ascending: false })
    .limit(10);
  if (error) throw error;
  return (data ?? []) as JobListing[];
}
```

---

### `apps/web/src/lib/env.ts` (config, extend)

**Analog:** self — add bindings

**Existing pattern** (lines 1–28):
```typescript
export interface CloudflareEnv {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_KEY: string;
  BREVO_API_KEY: string;
  // ... existing bindings ...
}

export function getEnv(locals: App.Locals): CloudflareEnv {
  if (locals.runtime?.env) return locals.runtime.env as CloudflareEnv;
  return {
    SUPABASE_URL: import.meta.env.SUPABASE_URL,
    // ... mirror all fields from import.meta.env ...
  } as CloudflareEnv;
}
```

**Add to `CloudflareEnv`:**
```typescript
CF_ACCOUNT_ID: string;
CF_API_TOKEN: string;
LOGODEV_TOKEN?: string;
ANALYTICS: AnalyticsEngineDataset;  // CF Analytics Engine binding
```

---

### `apps/web/src/env.d.ts` (config, extend)

**Analog:** self

**Existing pattern** (lines 1–26) — mirrors `CloudflareEnv` in `App.Locals`:
```typescript
/// <reference types="astro/client" />
/// <reference types="@cloudflare/workers-types" />

import type { Runtime } from "@astrojs/cloudflare";
import type { CloudflareEnv } from "./lib/env";

declare namespace App {
  interface Locals extends Runtime<CloudflareEnv> {
    niche: import("@owljobs/niches").NicheConfig;
    session?: import("@supabase/supabase-js").Session | null;
    employerId?: string | null;
  }
}
```

**Add `ANALYTICS` binding type to `CloudflareEnv` in env.ts; `env.d.ts` picks it up automatically.**

---

### `apps/web/wrangler.toml` (config, extend)

**Analog:** self — add analytics_engine_datasets block

**Existing file** (15 lines, Pages config, no analytics yet):
```toml
name = "owljobs-web"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]
pages_build_output_dir = "dist"
```

**Add analytics binding** (from RESEARCH.md Pattern 6):
```toml
[[analytics_engine_datasets]]
binding = "ANALYTICS"
dataset = "owljobs_events"
```

---

### `apps/web/src/middleware.ts` (middleware, extend)

**Analog:** self — add session + employerId injection

**Existing pattern** (lines 1–14):
```typescript
import { defineMiddleware } from "astro:middleware";
import { nicheFromHost } from "@owljobs/niches";

export const onRequest = defineMiddleware(async (ctx, next) => {
  const host = ctx.request.headers.get("host") ?? "";
  ctx.locals.niche = nicheFromHost(host);
  return next();
});
```

**Extend to inject session and employerId** (after niche assignment):
```typescript
import { createSupabaseServerClient } from "./lib/supabase";
import { getEnv } from "./lib/env";

// After ctx.locals.niche = nicheFromHost(host):
const env = getEnv(ctx.locals);
const responseHeaders = new Headers();
const supabase = createSupabaseServerClient(
  env,
  ctx.request.headers.get("cookie"),
  responseHeaders,
);
const { data: { session } } = await supabase.auth.getSession();
ctx.locals.session = session;
ctx.locals.employerId = session?.user?.app_metadata?.employer_id ?? null;

const response = await next();
// Propagate Set-Cookie headers from supabase SSR
responseHeaders.forEach((value, key) => response.headers.append(key, value));
return response;
```

---

### `apps/web/src/pages/employers/[slug].astro` (page, extend)

**Analog:** self — add ClaimListingCTA and logo.dev fallback

**Existing frontmatter pattern** (lines 1–30):
```typescript
---
import Layout from "../../components/Layout.astro";
import JobCardModern from "../../components/JobCardModern.astro";
import { supabasePublic } from "../../lib/supabase";
import { listEmployerJobs } from "../../lib/jobs";
import { setCacheHeaders } from "../../lib/cache";
import { getEnv } from "../../lib/env";

const niche = Astro.locals.niche;
const env = getEnv(Astro.locals);
const { slug } = Astro.params;
// ... query employer ...
if (!employer) return Astro.redirect("/employers");
setCacheHeaders(Astro.response.headers, 3600, 300);
---
```

**Existing initials pattern** (lines 43–49):
```typescript
const initials = employer.name
  .split(/\s+/)
  .slice(0, 2)
  .map((w: string) => w[0])
  .join("")
  .toUpperCase();
```

**Existing initials tile** (lines 70–72) — analog for EmployerLogo fallback:
```html
<div class="flex h-16 w-16 items-center justify-center rounded-xl bg-accent text-accent-foreground text-xl font-bold">
  {initials}
</div>
```

**Add ClaimListingCTA** — render when `!employer.claimed` (check `employer_users` table) + when `session?.user?.app_metadata?.employer_id !== employer.id`.

---

### `apps/web/src/pages/[landingSlug].astro` (page, request-response)

**ROUTING NOTE:** Use `[landingSlug].astro` (single-segment dynamic route), NOT `[...path].astro`. The catch-all conflicts with Astro's `_server-islands/*` internal routes in production builds (Astro Issue #11793).

**Analog:** `apps/web/src/pages/jobs/index.astro`

**Imports pattern** (lines 1–14 of jobs/index.astro):
```typescript
---
import Layout from "../components/Layout.astro";
import JobCardModern from "../components/JobCardModern.astro";
import FeaturedJobCard from "../components/FeaturedJobCard.astro";
import { listJobs, listFeaturedJobs } from "../lib/jobs";
import { getEnv } from "../lib/env";
import { setCacheHeaders } from "../lib/cache";

const niche = Astro.locals.niche;
const env = getEnv(Astro.locals);
---
```

**Static paths pattern** — `getStaticPaths()` reads from `niche.landingPages` via registry:
```typescript
export async function getStaticPaths() {
  // getAllNiches() returns all registered niches; each niche has landingPages[]
  // This runs at build time — niche config is the source of truth
  const { getAllNiches } = await import("@owljobs/niches");
  const paths = [];
  for (const niche of getAllNiches()) {
    for (const page of niche.landingPages ?? []) {
      paths.push({ params: { landingSlug: page.slug }, props: { page, niche } });
    }
  }
  return paths;
}
```

**Intro paragraph template** (D-19):
```astro
<p class="text-muted-foreground mb-6">
  {jobs.length} open {niche.name} jobs in {page.label} as of {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}.
</p>
```

**Cache headers** — same as `jobs/index.astro`: `setCacheHeaders(Astro.response.headers, 3600, 300)`

---

### `apps/web/src/pages/dashboard.astro` (page, request-response)

**ROUTING NOTE:** Use `dashboard.astro` at `apps/web/src/pages/dashboard.astro` (resolves to `/dashboard`). Not `dashboard/index.astro`.

**Analog:** `apps/web/src/pages/jobs/[slug].astro` (two-column layout, auth guard pattern)

**Auth guard pattern** — redirect to `/employers` if no session or no employerId:
```typescript
---
const session = Astro.locals.session;
const employerId = Astro.locals.employerId;
if (!session || !employerId) return Astro.redirect("/employers");
---
```

**Two-column layout pattern** (from jobs/[slug].astro lines 180–220):
```astro
<div class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
  <div class="grid grid-cols-1 gap-8 lg:grid-cols-3">
    <main class="lg:col-span-2">
      <!-- main content -->
    </main>
    <aside class="space-y-6">
      <!-- sidebar -->
    </aside>
  </div>
</div>
```

**Stats query pattern** — call `/api/stats?employer_id=X` from server in frontmatter (not client-side):
```typescript
const statsResp = await fetch(
  `${Astro.url.origin}/api/stats?employer_id=${encodeURIComponent(employerId)}`,
  { headers: { cookie: Astro.request.headers.get("cookie") ?? "" } }
);
const stats = statsResp.ok ? await statsResp.json() : { views: 0, applies: 0 };
```

---

### `apps/web/src/pages/auth/callback.astro` (page, request-response)

**Analog:** `apps/web/src/pages/jobs/[slug].astro` (SSR page with redirect)

**Core PKCE callback pattern** (from RESEARCH.md Pattern 2):
```typescript
---
const responseHeaders = new Headers();
const supabase = createSupabaseServerClient(
  getEnv(Astro.locals),
  Astro.request.headers.get("cookie"),
  responseHeaders,
);
const code = new URL(Astro.request.url).searchParams.get("code");
if (code) {
  await supabase.auth.exchangeCodeForSession(code);
}
return Astro.redirect("/dashboard", 302);
// Note: responseHeaders with Set-Cookie must be applied via middleware
---
```

**Important:** Session cookies are set by the middleware's SSR client before the redirect. The `auth/callback.astro` page only needs to call `exchangeCodeForSession` — cookie propagation is handled by middleware.

---

### `apps/web/src/pages/api/claim.ts` (route, request-response)

**Analog:** `apps/web/src/pages/api/subscribe.ts`

**Full pattern structure** (lines 1–108 of subscribe.ts):

**Imports pattern** (lines 1–8):
```typescript
import type { APIContext } from "astro";
import { getEnv } from "../../lib/env";
import { supabaseAdmin } from "../../lib/supabase";
```

**POST handler pattern** (lines 10–108) — email validation, DB write, JSON response:
```typescript
export async function POST({ request, locals }: APIContext) {
  const niche = locals.niche;
  const env = getEnv(locals);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = typeof (body as Record<string, unknown>).email === "string"
    ? (body as Record<string, unknown>).email as string
    : "";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "Invalid email" }, { status: 400 });
  }

  const db = supabaseAdmin(env);
  // ... DB operation ...

  return Response.json({ ok: true }, { status: 200 });
}
```

**Domain-match claim logic** — claim.ts specific additions:
```typescript
// Extract domain from email
const emailDomain = email.split("@")[1]?.toLowerCase();

// Look up employer by slug, check domain field
const { data: employer } = await db
  .schema(niche.supabaseSchema)
  .from("employers")
  .select("id,domain")
  .eq("slug", slug)  // slug from request body
  .single();

if (!employer) return Response.json({ error: "Employer not found" }, { status: 404 });
if (!employer.domain || employer.domain.toLowerCase() !== emailDomain) {
  return Response.json({ error: "Email domain does not match this employer" }, { status: 403 });
}

// Send magic link via Supabase
const supabaseSSR = createSupabaseServerClient(env, null, new Headers());
const { error: otpError } = await supabaseSSR.auth.signInWithOtp({
  email,
  options: {
    emailRedirectTo: `https://${niche.domain}/auth/callback`,
    shouldCreateUser: true,
  },
});
if (otpError) return Response.json({ error: "Failed to send magic link" }, { status: 500 });

// PLANNER NOTE: When/where to insert the employer_users row is an open design question.
// At claim time, auth_id is unknown (user hasn't authenticated yet).
// Options: (a) insert with auth_id=NULL here, backfill in auth/callback.astro;
//          (b) use a pending_claims table; Auth Hook joins it at token-issue time.
// See Critical Finding 4. Do NOT insert employer_users with a NOT NULL auth_id constraint here.
```

**Error handling pattern** (from subscribe.ts lines 90–108) — consistent with all API routes:
```typescript
return Response.json({ ok: true }, { status: 200 });
// errors use: return Response.json({ error: "message" }, { status: N });
```

---

### `apps/web/src/pages/api/track.ts` (route, request-response)

**Analog:** `apps/web/src/pages/api/confirm.ts`

**GET with redirect pattern** (lines 1–29 of confirm.ts):
```typescript
import type { APIContext } from "astro";

export async function GET({ request, locals }: APIContext) {
  const url = new URL(request.url);
  const jobId = url.searchParams.get("job");
  const type = url.searchParams.get("type");  // "apply" | "view"

  // Write analytics event (fire-and-forget)
  const env = getEnv(locals);
  if (env.ANALYTICS && jobId) {
    env.ANALYTICS.writeDataPoint({
      blobs: [jobId, type ?? "view", locals.niche.id],
      doubles: [1],
      indexes: [jobId],
    });
  }

  // Redirect to ATS URL for apply clicks
  if (type === "apply") {
    const applyUrl = url.searchParams.get("url");
    if (applyUrl) return Response.redirect(applyUrl, 302);
  }

  return new Response(null, { status: 204 });
}
```

**Analytics Engine writeDataPoint pattern** (from RESEARCH.md Pattern 6):
```typescript
// Fire-and-forget — no await, no try/catch needed (CF handles failures)
env.ANALYTICS.writeDataPoint({
  blobs: [jobId, eventType, nicheId],
  doubles: [1],
  indexes: [jobId],  // used for efficient filtering in SQL API
});
```

---

### `apps/web/src/pages/api/stats.ts` (route, request-response)

**Analog:** `apps/web/src/pages/api/confirm.ts` (GET route structure) + RESEARCH.md Pattern 6 (Analytics Engine SQL API)

**GET handler + external API call pattern:**
```typescript
import type { APIContext } from "astro";
import { getEnv } from "../../lib/env";

export async function GET({ request, locals }: APIContext) {
  const session = locals.session;
  const employerId = locals.employerId;
  if (!session || !employerId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const env = getEnv(locals);
  const url = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`;

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const sql = `
    SELECT
      blob1 AS job_id,
      blob2 AS event_type,
      SUM(_sample_interval) AS count
    FROM owljobs_events
    WHERE blob3 = '${locals.niche.id}'
      AND index1 IN (SELECT id FROM ... )
      AND timestamp >= '${since}'
    GROUP BY job_id, event_type
  `;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.CF_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });

  if (!resp.ok) return Response.json({ views: 0, applies: 0 }, { status: 200 });
  const result = await resp.json();
  // ... aggregate result.data into { views, applies } ...
  return Response.json({ views, applies }, { status: 200 });
}
```

**No direct codebase analog for the CF SQL API call** — use RESEARCH.md Pattern 6 for full SQL query format.

---

### `apps/web/src/components/EmployerLogo.astro` (component)

**Analog:** `apps/web/src/pages/employers/[slug].astro` lines 43–72

**Initials computation pattern** (lines 43–49 of [slug].astro):
```typescript
const initials = employer.name
  .split(/\s+/)
  .slice(0, 2)
  .map((w: string) => w[0])
  .join("")
  .toUpperCase();
```

**Initials tile pattern** (lines 70–72 of [slug].astro):
```html
<div class="flex h-16 w-16 items-center justify-center rounded-xl bg-accent text-accent-foreground text-xl font-bold">
  {initials}
</div>
```

**logo.dev fallback pattern** (employer.domain must exist):
```astro
---
interface Props {
  name: string;
  domain?: string | null;
  size?: "sm" | "md" | "lg";
}
const { name, domain, size = "md" } = Astro.props;
const initials = name.split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();
const logoUrl = domain ? `https://img.logo.dev/${domain}?token=${env.LOGODEV_TOKEN}&size=64` : null;
---
{logoUrl
  ? <img src={logoUrl} alt={name} class="h-12 w-12 rounded-lg object-contain" />
  : <div class="flex h-12 w-12 items-center justify-center rounded-lg bg-accent text-accent-foreground text-sm font-bold">{initials}</div>
}
```

---

### `apps/web/src/components/ClaimListingCTA.astro` (component)

**Analog:** `apps/web/src/components/Header.astro` (modal toggle pattern, lines 39–73)

**Data-attribute toggle pattern** (lines 39–52 of Header.astro) — button opens/closes panel:
```html
<button
  type="button"
  data-mobile-menu-trigger
  class="..."
>
  Open menu
</button>

<div class="hidden ..." data-mobile-menu>
  <!-- panel content -->
</div>
```

**Script pattern** (lines 69–73 of Header.astro):
```javascript
const trigger = document.querySelector("[data-mobile-menu-trigger]");
const menu = document.querySelector("[data-mobile-menu]");
if (trigger && menu) {
  trigger.addEventListener("click", () => menu.classList.toggle("hidden"));
}
```

**Apply this pattern for ClaimListingCTA:**
```astro
<button type="button" data-claim-trigger class="...">
  Claim this listing
</button>

<div class="hidden ..." data-claim-panel>
  <MagicLinkForm employerSlug={slug} />
</div>

<script>
  const trigger = document.querySelector("[data-claim-trigger]");
  const panel = document.querySelector("[data-claim-panel]");
  if (trigger && panel) {
    trigger.addEventListener("click", () => panel.classList.toggle("hidden"));
  }
</script>
```

**Button styling** — use `ui/Button.astro` with `variant="default"` (primary):
```astro
import Button from "./ui/Button.astro";
<Button variant="default" data-claim-trigger>Claim this listing</Button>
```

---

### `apps/web/src/components/MagicLinkForm.astro` (component, event-driven)

**Analog:** `apps/web/src/components/Newsletter.astro`

**Form + fetch submit pattern** (lines 1–171 of Newsletter.astro):

**Imports + props pattern** (lines 1–10):
```typescript
---
interface Props {
  employerSlug: string;
}
const { employerSlug } = Astro.props;
---
```

**Form HTML pattern** (Newsletter.astro lines 45–80) — email input, submit button, feedback elements:
```html
<form id="claim-form" class="flex flex-col gap-3">
  <input
    type="email"
    name="email"
    required
    placeholder="you@company.com"
    class="..."
    id="claim-email"
  />
  <button type="submit" id="claim-btn" class="...">
    <span id="btn-text">Send magic link</span>
    <span id="btn-loading" class="hidden">Sending...</span>
  </button>
  <p id="claim-error" class="hidden text-sm text-destructive"></p>
  <p id="claim-success" class="hidden text-sm text-green-600">Check your email for the sign-in link.</p>
</form>
```

**Fetch submit handler pattern** (Newsletter.astro lines 90–140):
```javascript
const form = document.getElementById("claim-form");
const btn = document.getElementById("claim-btn");
const btnText = document.getElementById("btn-text");
const btnLoading = document.getElementById("btn-loading");
const errorEl = document.getElementById("claim-error");
const successEl = document.getElementById("claim-success");

form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  btn.disabled = true;
  btn.classList.add("opacity-50");
  btnText.classList.add("hidden");
  btnLoading.classList.remove("hidden");
  errorEl.classList.add("hidden");

  try {
    const res = await fetch("/api/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: document.getElementById("claim-email").value,
        slug: employerSlug,  // injected via data attribute
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Something went wrong");
    successEl.classList.remove("hidden");
    form.classList.add("hidden");
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove("hidden");
    btn.disabled = false;
    btn.classList.remove("opacity-50");
    btnText.classList.remove("hidden");
    btnLoading.classList.add("hidden");
  }
});
```

---

### `apps/web/src/components/FeaturedJobCard.astro` (component, wire real data)

**Analog:** self — wire `featured_until` from DB, remove dummy placeholder

**Existing props** (lines 1–20 of FeaturedJobCard.astro) — currently takes static props; wire to real `JobListing` type:
```typescript
---
interface Props {
  job: import("../lib/jobs").JobListing;  // real DB row
}
const { job } = Astro.props;
const isFeatured = job.featured_until && new Date(job.featured_until) > new Date();
---
```

**Badge position fix** — UI-SPEC says `-top-2` not `-top-2.5` (current):
```html
<!-- Change from: top-[-10px] or -top-2.5 -->
<!-- Change to: -->
<div class="absolute -top-2 left-4 ...">
```

---

### Dashboard components — `StatTile.astro`, `JobRow.astro`, `FeaturedToggle.astro`, `LockedFeatureCard.astro`

**Analog:** Compose from `ui/Card.astro`, `ui/Button.astro`, `ui/Badge.astro` — mirroring `FeaturedJobCard.astro`'s composition style.

**ui/Card.astro base pattern:**
```astro
<div class="bg-card text-card-foreground flex flex-col rounded-xl border shadow-sm">
  <slot />
</div>
```

**ui/Button.astro variant pattern** (lines 1–43 of Button.astro):
```typescript
---
interface Props {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
  href?: string;
  class?: string;
  [key: string]: unknown;
}
const { variant = "default", size = "default", href, class: className, ...rest } = Astro.props;
// renders as <a> if href present, otherwise <button>
---
```

**ui/Badge.astro accent variant** (for "Featured" label):
```astro
<Badge variant="accent">Featured</Badge>
<!-- renders: bg-accent/10 text-accent border-accent/20 -->
```

**StatTile composition:**
```astro
<div class="bg-card rounded-xl border p-6 shadow-sm">
  <div class="text-2xl font-semibold tabular-nums">{value}</div>
  <div class="text-sm text-muted-foreground mt-1">{label}</div>
</div>
```

**FeaturedToggle — toggle button with loading state:**
```astro
<button
  type="button"
  class:list={["...", { "bg-accent text-accent-foreground": featured, "bg-secondary": !featured }]}
  data-job-id={jobId}
  data-featured={featured}
>
  {featured ? "Featured" : "Set Featured"}
</button>
```

**LockedFeatureCard — locked overlay pattern:**
```astro
<div class="bg-card rounded-xl border p-6 relative opacity-60 pointer-events-none select-none">
  <slot />
  <div class="absolute inset-0 rounded-xl flex items-center justify-center bg-background/50 backdrop-blur-sm">
    <p class="text-sm font-medium text-muted-foreground">Available on paid plan — coming soon</p>
  </div>
</div>
```

---

### `workers/digest/src/index.ts` (worker, extend for ANLYT-02)

**Analog:** self — add second cron handler for weekly employer match alerts

**Existing handler structure** (lines 169–349):
```typescript
const handler: ExportedHandler<Env, DigestMessage> = {
  async scheduled(_event, env, ctx) { /* cron producer */ },
  async queue(batch, env) { /* queue consumer */ },
};
export default handler;
```

**ANLYT-02 extension:** add `EMPLOYER_ALERTS` queue binding; add second cron `"0 8 * * 1"` (Monday 08:00 UTC); add `employer_alerts` queue handler. Follow exact same pattern as digest: cron → queue → consumer.

**ctx.waitUntil pattern** (lines 177–207) — mandatory for 30s CPU cap:
```typescript
ctx.waitUntil(
  Promise.allSettled(
    niches.map(async (niche) => {
      // per-niche work
    })
  )
);
```

**msg.ack() / msg.retry() pattern** (lines 337–342):
```typescript
msg.ack();
// on unrecoverable error:
msg.retry();
```

---

### `workers/digest/wrangler.toml` (config, extend)

**Analog:** self

**Existing queue pattern** (lines 20–37 of wrangler.toml):
```toml
[[queues.producers]]
binding = "DIGEST_QUEUE"
queue = "owljobs-digest"

[[queues.consumers]]
queue = "owljobs-digest"
max_batch_size = 2
dead_letter_queue = "owljobs-digest-dlq"
```

**Add second cron + employer alerts queue:**
```toml
# In [triggers] crons array — add second entry:
crons = ["0 6 * * 1", "0 8 * * 1"]

[[queues.producers]]
binding = "EMPLOYER_ALERTS"
queue = "owljobs-employer-alerts"

[[queues.consumers]]
queue = "owljobs-employer-alerts"
max_batch_size = 5
dead_letter_queue = "owljobs-employer-alerts-dlq"
```

---

## Shared Patterns

### Niche context (all pages and API routes)
**Source:** `apps/web/src/middleware.ts` + `apps/web/src/pages/jobs/index.astro`
**Apply to:** All new `.astro` pages and `api/*.ts` routes
```typescript
const niche = Astro.locals.niche;       // in .astro pages
const niche = locals.niche;            // in api/*.ts routes
// NEVER hardcode niche.supabaseSchema — always from niche object
```

### Env access (all pages and API routes)
**Source:** `apps/web/src/lib/env.ts`
**Apply to:** All new `.astro` pages and `api/*.ts` routes
```typescript
import { getEnv } from "../../lib/env";
const env = getEnv(Astro.locals);   // .astro
const env = getEnv(locals);          // api/*.ts
```

### Supabase schema-scoped queries (all DB operations)
**Source:** `apps/web/src/lib/jobs.ts` lines 10–40, `workers/digest/src/index.ts` lines 231–244
**Apply to:** All new DB queries
```typescript
const db = supabaseAdmin(env);  // or supabasePublic for reads
db.schema(niche.supabaseSchema).from("jobs").select(...)
// public schema tables (employer_users, employer_subscriptions):
db.from("employer_users").select(...)  // no .schema() prefix for public
```

### Cache headers (all SSR pages)
**Source:** `apps/web/src/lib/cache.ts` via `apps/web/src/pages/jobs/index.astro`
**Apply to:** All new public-facing `.astro` pages (not dashboard — auth page must not cache)
```typescript
import { setCacheHeaders } from "../lib/cache";
setCacheHeaders(Astro.response.headers, 3600, 300);  // 1hr CDN, 5min stale-while-revalidate
// dashboard.astro: do NOT set cache headers
```

### API response format (all API routes)
**Source:** `apps/web/src/pages/api/subscribe.ts` lines 90–108
**Apply to:** All new `api/*.ts` routes
```typescript
// Success:
return Response.json({ ok: true }, { status: 200 });
return Response.json({ data: result }, { status: 200 });
// Error:
return Response.json({ error: "message" }, { status: 400 });
return Response.json({ error: "Unauthorized" }, { status: 401 });
return Response.json({ error: "Not found" }, { status: 404 });
```

### Auth guard (protected pages)
**Source:** `apps/web/src/middleware.ts` (extended) + RESEARCH.md Pattern 2
**Apply to:** `dashboard.astro`, `auth/callback.astro`
```typescript
const session = Astro.locals.session;
const employerId = Astro.locals.employerId;
if (!session || !employerId) return Astro.redirect("/employers");
```

### Multi-niche worker pattern (Cloudflare Workers)
**Source:** `workers/digest/src/index.ts` lines 173–207
**Apply to:** Any new worker or cron handler
```typescript
const niches = getAllNiches();
ctx.waitUntil(
  Promise.allSettled(
    niches.map(async (niche) => {
      const db = supabase.schema(niche.supabaseSchema);
      // ... per-niche work ...
    })
  )
);
```

### Test file structure (worker tests)
**Source:** `workers/digest/test/digest.test.ts`
**Apply to:** New worker test files
```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";

describe("workers/[name]/src/index.ts — [requirement IDs]", () => {
  let src = "";
  beforeAll(async () => {
    src = await readFile("workers/[name]/src/index.ts", "utf-8");
  });

  it("[requirement ID] — [description]", () => {
    expect(src).toMatch(/pattern/);
  });
});
```

**Pattern:** Source-contract tests (read file as string, assert patterns with `.toMatch()`). No runtime execution. Validates structural invariants and multi-niche compliance.

---

## No Analog Found

Files with no close match in the codebase (planner should use RESEARCH.md patterns instead):

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `apps/web/src/pages/auth/callback.astro` | page | request-response | No existing auth pages in project; use RESEARCH.md Pattern 2 verbatim |
| `apps/web/src/pages/api/stats.ts` | route | request-response | No CF Analytics Engine SQL API calls exist yet; use RESEARCH.md Pattern 6 |
| `apps/web/src/components/dashboard/FeaturedToggle.astro` | component | event-driven | No toggle/interactive components with fetch pattern in components/; compose from Button.astro + inline script |
| Database: Supabase Auth Hook function | database function | — | No existing Postgres functions in migrations; use RESEARCH.md Pattern 3 verbatim |

---

## Critical Findings (from RESEARCH.md — planner must not ignore)

1. **`employer_id` is TEXT not UUID** — `employer_users.employer_id` must be `TEXT`, matching `employers.id` which is `sha256(normalize(name))` (0001_initial.sql line 11)
2. **`idx_jobs_featured` is broken** — current index has `WHERE is_sponsored = TRUE`, but queries use `featured_until > NOW()`; migration 0007 must drop and recreate
3. **`[landingSlug].astro` not `[...path].astro`** — catch-all route conflicts with Astro `_server-islands/*` in production (Issue #11793)
4. **`employer_users` insert timing — open design question for planner** — at claim time (`/api/claim`) the user's `auth_id` is unknown (no auth yet). The DDL uses nullable `auth_id`. Planner must decide: (a) insert with `auth_id=NULL` in claim API, backfill in `auth/callback.astro` after `exchangeCodeForSession`; or (b) use a `pending_claims(email, employer_id, niche_id)` staging table that the Auth Hook joins. Option (a) is simpler; option (b) is cleaner. Both must populate `employer_users` before the Auth Hook emits a JWT with `employer_id` claim.
5. **`@supabase/ssr ^0.10.0`** — not currently installed; must be added; use `getAll`/`setAll` cookie adapter (NOT legacy `get`/`set`/`remove`)

---

## Metadata

**Analog search scope:** `apps/web/src/`, `workers/digest/`, `packages/schema/src/migrations/`, `packages/niches/src/`, `niches/`
**Files scanned:** 22 source files read directly
**Pattern extraction date:** 2026-05-12
