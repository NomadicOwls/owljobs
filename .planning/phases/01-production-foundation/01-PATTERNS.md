# Phase 1: Production Foundation - Pattern Map

**Mapped:** 2026-05-09
**Files analyzed:** 14 (3 NEW, 11 MODIFIED)
**Analogs found:** 14/14 (all matched)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `packages/schema/src/migrations/0004_stale_jobs_consent.sql` | migration | DDL | `packages/schema/src/migrations/0003_subscribers_multi_niche.sql` | exact |
| `workers/ingest/src/expire.ts` (NEW) | worker module | batch transform + DB write | `workers/ingest/src/ingest.ts` (upsertJob/upsertEmployer DB-helper section) | role-match |
| `workers/ingest/src/google-indexing.ts` (NEW) | service client | request-response (HTTPS to Google) | `apps/web/src/lib/turnstile.ts` (external HTTP verifier wrapper) | role-match |
| `workers/ingest/src/index.ts` | worker entrypoint | scheduled cron + queue handler | self (existing scheduled handler — extend, not replace) | exact |
| `workers/ingest/src/ingest.ts` | worker module | ATS fetch + upsert | self (extend `upsertJob` 23505 branch + return fetched IDs) | exact |
| `workers/ingest/wrangler.toml` | config | n/a | self (existing comment-block convention for secrets) | exact |
| `apps/web/src/pages/jobs/[slug].astro` | Astro page | request-response (SSR) | self (extend frontmatter with 410 branch) | exact |
| `apps/web/src/lib/jobs.ts` | data-access lib | CRUD reads | self (every list query already chains `.gte("classification_score", 0.5)` — add `.eq("status","active")` next to it) | exact |
| `apps/web/src/pages/sitemap.xml.ts` | API route (GET) | request-response (XML) | self (uses `listSitemapJobs` — filter pushed down to lib/jobs.ts) | n/a (no change) |
| `apps/web/src/pages/feed.json.ts` | API route (GET) | request-response (JSON) | self (uses `listFeedJobs`) | n/a (no change) |
| `apps/web/src/pages/feed.xml.ts` | API route (GET) | request-response (XML/RSS) | self (uses `listFeedJobs`) | n/a (no change) |
| `apps/web/src/components/Newsletter.astro` | UI component | form submit | self (add `<input type="checkbox" required>` + script-side check before submit) | exact |
| `apps/web/src/pages/privacy.astro` | Astro page | static (prerender) + client form | `apps/web/src/components/Newsletter.astro` (form HTML + Turnstile + client-fetch script) | role-match |
| `apps/web/src/pages/api/subscribe.ts` | API route (POST) | request-response | self (extend body-parse, add consent check + `consent_given_at` upsert field) | exact |
| `apps/web/src/pages/api/delete-request.ts` (NEW) | API route (POST) | request-response (validate + email) | `apps/web/src/pages/api/subscribe.ts` (Turnstile + Resend) | exact |

## Pattern Assignments

### `packages/schema/src/migrations/0004_stale_jobs_consent.sql` (NEW migration, DDL)

**Analog:** `packages/schema/src/migrations/0003_subscribers_multi_niche.sql`

**Header pattern** (lines 1-6):
```sql
-- Adds niche scoping + confirmation_token to wind_turbine.subscribers.
-- Reconciles with 0001_initial.sql which already has:
--   unsubscribe_token TEXT NOT NULL
--   UNIQUE(email)   → replaced by UNIQUE(email, niche)
--
-- Apply via Supabase SQL editor after 0001_initial.sql is live.
```

**ALTER TABLE pattern** (lines 8-13):
```sql
ALTER TABLE wind_turbine.subscribers
  ADD COLUMN niche              TEXT NOT NULL DEFAULT 'wind-turbine',
  ADD COLUMN confirmation_token TEXT;

-- Drop the default — every insert must supply the niche explicitly.
ALTER TABLE wind_turbine.subscribers ALTER COLUMN niche DROP DEFAULT;
```

**Partial unique index pattern** (lines 21-23):
```sql
CREATE UNIQUE INDEX subscribers_confirmation_token_key
  ON wind_turbine.subscribers (confirmation_token)
  WHERE confirmation_token IS NOT NULL;
```

**Multi-niche placeholder convention** (from `0001_initial.sql` line 2):
```
-- Replace every occurrence of «wind_turbine» with your niche's schema name before running.
```

**RLS policy DROP/CREATE replacement** (from `0002_rls.sql` lines 10-14):
```sql
CREATE POLICY public_relevant_jobs ON wind_turbine.jobs FOR SELECT TO anon
  USING (
    classification_score >= 0.6
    OR (is_sponsored AND (featured_until IS NULL OR featured_until > now()))
  );
```

**Apply to 0004:** Use `wind_turbine` placeholder. Use `ADD COLUMN ... CHECK (...)` for `status`. Use partial index `WHERE status = 'expired'` for cleanup index, `WHERE status = 'active'` for hot-path index. DROP existing `public_relevant_jobs` policy, recreate with `status = 'active' AND ...`. Backfill existing subscribers `consent_given_at = created_at`.

---

### `workers/ingest/src/expire.ts` (NEW — worker module, batch transform)

**Analog:** `workers/ingest/src/ingest.ts` (DB-helpers section, lines 299-404)

**Imports pattern** (lines 1-11):
```typescript
import type { NicheConfig, WorkdayTarget, GreenhouseTarget, SuccessFactorsTarget, RecruiteeTarget, SoftgardenTarget } from "@owljobs/niches";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllWorkdayJobs, WorkdayAdapterError } from "@owljobs/ats-adapters/workday";
// ...
import { sha256Hex, normalizeForKey } from "@owljobs/schema";

// The `db` param is a schema-scoped Supabase client: supabase.schema(niche.supabaseSchema)
type SchemaClient = ReturnType<SupabaseClient["schema"]>;
```

**Stats result interface pattern** (lines 13-17):
```typescript
interface IngestStats {
  inserted: number;
  skipped: number;
  errors: number;
}
```

**Supabase update + error-throw pattern** (lines 313-328):
```typescript
const { error } = await db.from("employers").upsert(
  { /* ... */ },
  { onConflict: "id" }
);
if (error) throw new Error(`upsertEmployer failed: ${error.message}`);
```

**Error pre-check + early-return pattern** (lines 27-44, the per-target try/catch):
```typescript
try {
  if (target.atsType === "workday") {
    await ingestWorkday(target, db, localStats);
  } else if (...) { /* ... */ }
} catch (err) {
  console.error(`[ingest] error processing ${target.employer}:`, err);
  localStats.errors++;
}
```

**Apply to expire.ts:** Use `SchemaClient` type. Define `ExpireResult { marked, reactivated, pinged, pingFailures, pingsSkipped }`. `expireMissingJobs(db, employerId, fetchedJobIds, saJson?)` — if set is empty return zeros. SELECT active rows for employer, compute diff, UPDATE `status='expired', expired_at=NOW()` IN (ids), then loop pings with `PING_BUDGET_PER_RUN = 100` cap. `cleanupExpired(db)` — DELETE WHERE `status='expired' AND expired_at < cutoff`. Throw `Error(`prefix failed: ${err.message}`)` on Supabase errors (matches existing convention).

---

### `workers/ingest/src/google-indexing.ts` (NEW — service client, request-response)

**Analog:** `apps/web/src/lib/turnstile.ts` (external HTTP verifier wrapper — same shape: env interface → fetch → parse JSON → return result)

**Env-interface + fetch pattern** (lines 1-24):
```typescript
interface TurnstileEnv {
  TURNSTILE_SECRET_KEY: string;
}

export async function verifyTurnstile(
  env: TurnstileEnv,
  token: string,
  ip?: string,
): Promise<boolean> {
  const body = new URLSearchParams({
    secret: env.TURNSTILE_SECRET_KEY,
    response: token,
  });
  if (ip) body.set("remoteip", ip);

  const res = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    { method: "POST", body },
  );
  if (!res.ok) return false;

  const json = (await res.json()) as { success: boolean };
  return json.success === true;
}
```

**Resend wrapper as secondary analog** (`apps/web/src/lib/resend.ts` lines 13-32) — same HTTP+fetch+JSON-body shape:
```typescript
async function sendEmail(env: ResendEnv, params: SendEmailParams): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ /* ... */ }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend error ${res.status}: ${text}`);
  }
}
```

**WebCrypto digest convention** (`packages/schema/src/index.ts` lines 81-87):
```typescript
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
```

**Apply to google-indexing.ts:** Mirror `verifyTurnstile` shape. Export `pingUrlUpdated(saJson: string, url: string): Promise<{ok: boolean; status: number}>`. Use `jose`'s `SignJWT` + `importPKCS8` (RESEARCH Pattern 3). Replace `\\n` → `\n` in `private_key` PEM. Two-step: token-exchange POST to `oauth2.googleapis.com/token`, then publish POST to `indexing.googleapis.com/v3/urlNotifications:publish` with `Authorization: Bearer ${token}`. Throw on token exchange failure (`throw new Error(`token exchange failed: ${res.status} ${text}`)` — matches Resend wrapper). Return `{ok, status}` for ping failures (non-fatal at caller).

---

### `workers/ingest/src/index.ts` (MODIFIED — extend scheduled handler)

**Analog:** self (extend, do not replace).

**Existing env interface to extend** (lines 16-23):
```typescript
export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  AI: Ai;
  CLASSIFY_QUEUE: Queue<NicheMessage>;
  ENRICH_QUEUE: Queue<NicheMessage>;
  PAGES_DEPLOY_HOOK?: string;
}
```

**Existing scheduled handler to extend** (lines 31-52):
```typescript
const handler: ExportedHandler<Env, NicheMessage> = {
  async scheduled(_event, env, ctx) {
    const supabase = makeSupabase(env);
    const niches = getAllNiches();

    ctx.waitUntil(
      Promise.allSettled(
        niches.map(async (niche) => {
          const db = supabase.schema(niche.supabaseSchema);
          try {
            const stats = await ingestNiche(niche, db);
            console.log(
              `[${niche.id}] ingest complete: ${stats.inserted} new, ${stats.skipped} skipped, ${stats.errors} errors`
            );
            await env.CLASSIFY_QUEUE.send({ nicheId: niche.id });
          } catch (err) {
            console.error(`[${niche.id}] ingest failed:`, err);
          }
        })
      )
    );
  },
```

**Apply to index.ts:** Add `GOOGLE_INDEXING_KEY?: string;` to `Env`. After `ingestNiche(...)` returns (which already calls `expireMissingJobs` per-employer internally — see ingest.ts plan), call `await cleanupExpired(db)` and log. Keep `ctx.waitUntil(Promise.allSettled(...))` outer wrapping. Pass `env.GOOGLE_INDEXING_KEY` down through `ingestNiche` so per-employer expire calls can ping.

---

### `workers/ingest/src/ingest.ts` (MODIFIED — return fetched IDs + reactivation branch)

**Analog:** self.

**Existing 23505 duplicate-key branch to extend** (lines 376-386):
```typescript
if (error) {
  if (error.code === "23505") {
    // Backfill description if we have one and the stored row doesn't
    if (input.description) {
      await db.from("jobs").update({ description: input.description }).eq("id", input.id).is("description", null);
    }
    return false;
  }
  throw new Error(`upsertJob failed: ${error.message}`);
}
```

**Existing per-target loop to extend** (lines 88-105 — pattern repeats for all 5 ATS adapters):
```typescript
for (const job of jobs) {
  try {
    const inserted = await upsertJob(db, {
      id: job.sourceId, /* ... */
    });
    inserted ? stats.inserted++ : stats.skipped++;
  } catch (err) {
    console.error(`[ingest] failed to upsert job "${job.title}":`, err);
    stats.errors++;
  }
}
```

**Apply to ingest.ts:**
1. After existing 23505 description backfill, add reactivation update:
   ```typescript
   await db
     .from("jobs")
     .update({ status: "active", expired_at: null })
     .eq("id", input.id)
     .eq("status", "expired");
   ```
2. Each `ingest<ATS>` helper accumulates a `Set<string>` of fetched job IDs (use the same `input.id` that's passed to upsert). After the per-job loop, IF set size >= 1, call `expireMissingJobs(db, employerId, fetchedIds, saJson)` and merge counts into stats. Skip on `jobs.length === 0` (CONTEXT D-01 guard against ATS outage).
3. Plumb `saJson` (from `env.GOOGLE_INDEXING_KEY`) through `ingestNiche` signature.

---

### `workers/ingest/wrangler.toml` (MODIFIED — document new secret)

**Analog:** self (lines 36-44, existing comment-block secret convention):
```toml
# Supabase credentials — set as secrets, never in plaintext here.
# Run once per environment:
#   wrangler secret put SUPABASE_URL
#   wrangler secret put SUPABASE_SERVICE_KEY
#
# For local dev, create workers/ingest/.dev.vars:
#   SUPABASE_URL=https://<ref>.supabase.co
#   SUPABASE_SERVICE_KEY=<service_role_key>
```

**Apply to wrangler.toml:** Append a comment line `wrangler secret put GOOGLE_INDEXING_KEY` and a `.dev.vars` example with the JSON service-account blob. **Do not put the secret value in `wrangler.toml`.** Note in RESEARCH pitfall 2: this is a Worker secret, NOT a Pages secret.

---

### `apps/web/src/pages/jobs/[slug].astro` (MODIFIED — add 410 branch)

**Analog:** self.

**Existing frontmatter pattern to extend** (lines 1-26):
```astro
---
import Layout from "../../components/Layout.astro";
import { supabasePublic } from "../../lib/supabase.js";
import { getJobBySlug, slugFromId } from "../../lib/jobs.js";
import { setCacheHeaders } from "../../lib/cache.js";
import { getEnv } from "../../lib/env.js";
// ...
const { niche } = Astro.locals;
const env = getEnv(Astro.locals);

const { slug } = Astro.params;
if (!slug) return Astro.redirect("/404");

const db = supabasePublic(env);
let job: Awaited<ReturnType<typeof getJobBySlug>> = null;

try {
  job = await getJobBySlug(db, niche.supabaseSchema, slug);
} catch {
  // fall through → 404
}

if (!job) return Astro.redirect("/404");

setCacheHeaders(Astro.response.headers, 600, 3600);
```

**404 page body pattern** (`apps/web/src/pages/404.astro` lines 6-26):
```astro
<Layout title="Page Not Found" description="The page you're looking for doesn't exist.">
  <div class="flex min-h-[50vh] flex-col items-center justify-center px-4 py-24 text-center">
    <h1 class="mb-3 text-3xl font-bold tracking-tight text-foreground">Page not found</h1>
    <p class="mb-8 max-w-sm text-muted-foreground">The job listing may have been filled or the link is incorrect.</p>
    <a href="/jobs" class="inline-flex items-center rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90">
      Browse open jobs
    </a>
  </div>
</Layout>
```

**`setCacheHeaders` API** (`apps/web/src/lib/cache.ts`):
```typescript
export function setCacheHeaders(headers: Headers, sMaxAge: number, staleWhileRevalidate = 0): void {
  // sets Cache-Control: public, s-maxage=<n>, stale-while-revalidate=<n>
}
```

**Apply to [slug].astro:**
1. After `if (!job) return Astro.redirect("/404")`, add:
   ```astro
   if (job.status === "expired") {
     Astro.response.status = 410;
     setCacheHeaders(Astro.response.headers, 300, 0); // short cache, no SWR — propagation must be fast
   } else {
     setCacheHeaders(Astro.response.headers, 600, 3600);
   }
   ```
2. Conditionally render the existing template OR a minimal 410 body (mirror 404 layout — heading + paragraph + "Browse open roles →" link to `/jobs`). Use ternary in template per RESEARCH Pattern 1.
3. Do NOT pre-filter `status` in `getJobBySlug` — it must distinguish "exists but expired" (410) from "never existed" (404).

---

### `apps/web/src/lib/jobs.ts` (MODIFIED — add status filter to all read queries)

**Analog:** self (every list query already chains a classification filter — drop the status filter alongside it).

**Existing chained-filter pattern** (lines 26-34, repeated in `listEmployerJobs`, `listFeedJobs`, `listSitemapJobs`, `getStats`):
```typescript
let query = db
  .schema(schema)
  .from("jobs")
  .select(/* ... */)
  // Unclassified rows (NULL) are hidden until classify runs
  .gte("classification_score", 0.5)
  .order("is_sponsored", { ascending: false })
  .order("posted_at", { ascending: false, nullsFirst: false })
  .range(offset, offset + perPage - 1);
```

**`getStats.activeJobs` query that needs both filters** (lines 152-154):
```typescript
db.schema(schema).from("jobs").select("id", { count: "exact", head: true })
  .gte("classification_score", 0.5)
  .or(`expires_at.is.null,expires_at.gt.${now}`),
```

**`getJobBySlug` — DO NOT modify** (lines 46-68) — must return expired rows so `[slug].astro` can return 410.

**Apply to jobs.ts:**
- `listJobs`: add `.eq("status", "active")` after `.gte("classification_score", 0.5)`.
- `listEmployerJobs`: same — add after `.gte(..., 0.5)` on the inner jobs select (line ~94).
- `listFeedJobs`: same (line ~115).
- `listSitemapJobs`: same (line ~131).
- `getStats.activeJobs`: add `.eq("status", "active")` next to the existing `.or(expires_at...)` chain. Also add to `getStats.recent` (line 156) since "new this week" should also exclude expired.
- `getJobBySlug`: leave unchanged.

---

### `apps/web/src/pages/sitemap.xml.ts`, `feed.json.ts`, `feed.xml.ts` (no code change)

**Analog:** themselves — they already delegate to `listSitemapJobs` / `listFeedJobs`. Filter pushed down to `lib/jobs.ts`.

**Pattern** (e.g. `sitemap.xml.ts` lines 1-12):
```typescript
import { supabasePublic } from "../lib/supabase.js";
import { listSitemapJobs, slugFromId } from "../lib/jobs.js";
import { getEnv } from "../lib/env.js";

export const GET: APIRoute = async ({ locals }) => {
  const { niche } = locals;
  const env = getEnv(locals);
  const db = supabasePublic(env);
  const jobs = await listSitemapJobs(db, niche.supabaseSchema);
  // ...
};
```

**Apply:** No-op for these three files — confirmed in plan as "no code change needed; covered by lib/jobs.ts changes." Verify after lib changes that all three exclude expired rows (acceptance test).

---

### `apps/web/src/components/Newsletter.astro` (MODIFIED — add required consent checkbox)

**Analog:** self.

**Existing form structure** (lines 44-77):
```astro
<form
  id="subscribe-form"
  class="mt-8"
  novalidate
  data-turnstile-key={siteKey}
>
  <div class="flex flex-col gap-3 sm:flex-row sm:justify-center">
    <label for="subscribe-email" class="sr-only">Email address</label>
    <input type="email" id="subscribe-email" name="email" placeholder="your@email.com" required ... />
    <div class="cf-turnstile" data-sitekey={siteKey} data-theme="auto"></div>
    <button type="submit" id="subscribe-submit" ...>Subscribe</button>
  </div>
  <p id="subscribe-error" class="mt-3 text-sm text-destructive min-h-[1.25rem]" role="alert" aria-live="polite"></p>
  <p id="subscribe-success" class="mt-3 text-sm text-accent min-h-[1.25rem]" role="status" aria-live="polite"></p>
</form>
```

**Existing client-side submit script** (lines 95-146):
```typescript
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  // ...
  const turnstileToken = tokenInput?.value ?? "";
  // ...
  const res = await fetch("/api/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, turnstileToken }),
  });
  // ...
});
```

**Existing Checkbox component** (`apps/web/src/components/ui/Checkbox.astro`) — already has the styled checkbox + checkmark SVG; consume via slot for the label content.

**Apply to Newsletter.astro:**
1. Below the email/Turnstile/button row, before the `<p id="subscribe-error">`, add a wrapper label with `<input type="checkbox" name="consent" id="subscribe-consent" required>`. Multi-niche text using `niche.name.toLowerCase()`. Link to `/privacy`.
2. In the script, before the `fetch()` call, add a check:
   ```typescript
   const consent = (form.querySelector('[name="consent"]') as HTMLInputElement | null)?.checked ?? false;
   if (!consent) {
     errorEl.textContent = "Please confirm you agree to receive job alerts.";
     return;
   }
   ```
3. Update fetch body to include `consent: true`.

---

### `apps/web/src/pages/privacy.astro` (MODIFIED — append deletion form section)

**Analog (form HTML + Turnstile + client script):** `apps/web/src/components/Newsletter.astro`

**Constraint:** `privacy.astro` has `export const prerender = true` (line 2). The form must be a client-side `fetch` — the same pattern Newsletter.astro uses.

**Multi-niche email mailbox:** Use `niche.domain` not hardcoded `windturbinejobs.com` (RESEARCH Open Question 3). The page already runs through Astro middleware so `Astro.locals.niche` is available even on prerendered pages.

**Existing privacy page layout** (lines 8-107) — `<div class="mx-auto max-w-2xl px-4 py-14 pb-20 sm:px-6">` with `prose-content` styling.

**Apply to privacy.astro:**
1. Frontmatter: `import { getEnv } from "../lib/env.js"; const env = getEnv(Astro.locals); const turnstileSiteKey = env.TURNSTILE_SITE_KEY;` — note the prerender pitfall (RESEARCH Pitfall 8): TURNSTILE_SITE_KEY is public; if `runtime.env` is empty at prerender time, fall through to `import.meta.env` (already handled by `getEnv`).
2. Append a `<section>` after the existing prose `</div>`:
   - `<h2>Request data deletion</h2>` — short GDPR Article 17 paragraph
   - Form with `id="delete-form"`, email input, `<div class="cf-turnstile" data-sitekey={turnstileSiteKey}>`, submit button, error/success `<p>` elements
   - Mirror Newsletter.astro's success/error pattern (`min-h-[1.25rem] role="alert"/"status" aria-live="polite"`)
3. Append `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer is:inline></script>` then a `<script>` block that POSTs to `/api/delete-request` with `{email, turnstileToken}`. Reset form + Turnstile on success. Inline success: `"We received your request and will process it within 30 days."`

---

### `apps/web/src/pages/api/subscribe.ts` (MODIFIED — require consent + write timestamp)

**Analog:** self.

**Existing body parse + validate pattern** (lines 11-33):
```typescript
let body: { email?: string; turnstileToken?: string };
try {
  body = (await request.json()) as { email?: string; turnstileToken?: string };
} catch {
  return Response.json({ error: "Invalid request body." }, { status: 400 });
}

const email = body.email?.trim().toLowerCase() ?? "";
const turnstileToken = body.turnstileToken ?? "";

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  return Response.json({ error: "Please enter a valid email address." }, { status: 400 });
}

if (!turnstileToken) {
  return Response.json({ error: "Please complete the security check." }, { status: 400 });
}

const ip = request.headers.get("CF-Connecting-IP") ?? undefined;
const valid = await verifyTurnstile(env, turnstileToken, ip);
if (!valid) {
  return Response.json({ error: "Security check failed. Please try again." }, { status: 400 });
}
```

**Existing upsert** (lines 40-55):
```typescript
const { error: upsertError } = await db
  .schema(niche.supabaseSchema)
  .from("subscribers")
  .upsert(
    {
      id: crypto.randomUUID(),
      email,
      niche: niche.id,
      confirmation_token: confirmationToken,
      unsubscribe_token: unsubscribeToken,
      confirmed_at: null,
      locations: null,
      created_at: new Date().toISOString(),
    },
    { onConflict: "email,niche", ignoreDuplicates: false },
  );
```

**Apply to subscribe.ts:**
1. Widen body type: `{ email?: string; turnstileToken?: string; consent?: boolean }`.
2. After Turnstile check, add `if (!body.consent) { return Response.json({ error: "Consent required." }, { status: 400 }); }`.
3. In upsert object, add `consent_given_at: new Date().toISOString()`.

---

### `apps/web/src/pages/api/delete-request.ts` (NEW — Turnstile + email founder)

**Analog:** `apps/web/src/pages/api/subscribe.ts` (full pattern: body parse → Turnstile → action → response).

**Imports + handler signature** (subscribe.ts lines 1-9):
```typescript
import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../lib/supabase.js";
import { verifyTurnstile } from "../../lib/turnstile.js";
import { sendConfirmation } from "../../lib/resend.js";
import { getEnv } from "../../lib/env.js";

export const POST: APIRoute = async ({ locals, request }) => {
  const { niche } = locals;
  const env = getEnv(locals);
```

**`sendEmail` wrapper signature** (`apps/web/src/lib/resend.ts` lines 13-32) — already exists internally, can be exported or reused via a new helper:
```typescript
async function sendEmail(env: ResendEnv, params: SendEmailParams): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: params.from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      headers: params.headers,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend error ${res.status}: ${text}`);
  }
}
```

**Apply to delete-request.ts:**
1. POST handler. Body: `{ email?: string; turnstileToken?: string }`.
2. Validate email regex (copy from subscribe.ts line 21). Validate Turnstile (copy lines 25-33).
3. Call new helper `sendDeletionRequest(env, { to: `privacy@${niche.domain}`, requesterEmail: email, fromAddress: `${niche.name} <noreply@${niche.domain}>`, niche: niche.name })` exported from `lib/resend.ts` (extend that file with the new helper that delegates to the existing private `sendEmail`).
4. Return `Response.json({ message: "We received your request and will process it within 30 days." })`.
5. On Resend failure, return `{ error: "Could not submit request. Please try again." }` with `status: 500` (matches subscribe.ts line 87-90 pattern).

---

## Shared Patterns

### Multi-niche schema scoping
**Source:** `workers/ingest/src/index.ts` lines 36-39, `apps/web/src/pages/api/subscribe.ts` lines 41
**Apply to:** All DB calls in expire.ts, subscribe.ts, delete-request.ts (any handler-level DB code)
```typescript
// Worker
const db = supabase.schema(niche.supabaseSchema);
await db.from("jobs").select(/* ... */);

// Astro API
await db.schema(niche.supabaseSchema).from("subscribers").upsert(/* ... */);
```
Never hardcode `wind_turbine`. Niche comes from `Astro.locals.niche` (frontend) or `getAllNiches()` (workers).

### Schema-scoped client type
**Source:** `workers/ingest/src/ingest.ts` line 11
**Apply to:** expire.ts, any new worker module that takes a pre-scoped client
```typescript
type SchemaClient = ReturnType<SupabaseClient["schema"]>;
```

### `getEnv` runtime/build fallback
**Source:** `apps/web/src/lib/env.ts` lines 15-28
**Apply to:** All Astro pages and API routes (especially prerendered ones)
```typescript
const env = getEnv(Astro.locals);
```
Handles both Cloudflare runtime (`locals.runtime.env`) and astro dev (`import.meta.env`). The deletion form on `/privacy` (prerender) relies on this fallback for `TURNSTILE_SITE_KEY`.

### Turnstile verification
**Source:** `apps/web/src/lib/turnstile.ts` lines 5-24
**Apply to:** delete-request.ts (and verify subscribe.ts pattern is preserved)
```typescript
const ip = request.headers.get("CF-Connecting-IP") ?? undefined;
const valid = await verifyTurnstile(env, turnstileToken, ip);
if (!valid) {
  return Response.json({ error: "Security check failed. Please try again." }, { status: 400 });
}
```

### Resend wrapper extension
**Source:** `apps/web/src/lib/resend.ts` lines 13-32 (private `sendEmail`) + lines 34-64 (public `sendConfirmation`) + lines 66-84 (public `sendUnsubscribeAck`)
**Apply to:** Add `sendDeletionRequest(env, opts)` as a third public helper using the same `sendEmail` private function. Throw on non-2xx.

### Error throw convention (DB)
**Source:** `workers/ingest/src/ingest.ts` line 327, line 385
**Apply to:** expire.ts, any new DB-touching code
```typescript
if (error) throw new Error(`<operation> failed: ${error.message}`);
```

### `Promise.allSettled` for per-employer isolation
**Source:** `workers/ingest/src/ingest.ts` lines 24-47, `workers/ingest/src/index.ts` lines 37-51
**Apply to:** expire.ts when iterating multiple employers, OR (preferred per CONTEXT D-04) call `expireMissingJobs` inside the existing per-target `Promise.allSettled` block in `ingestNiche`. Per-employer failure must not halt others.

### Form HTML + Turnstile + client-fetch (Astro pattern)
**Source:** `apps/web/src/components/Newsletter.astro` lines 44-77 (HTML) + 95-146 (script)
**Apply to:** privacy.astro deletion form
- `<form novalidate data-turnstile-key={key}>` wrapper
- `<div class="cf-turnstile" data-sitekey={key} data-theme="auto"></div>` widget
- Twin error/success `<p>` elements with `min-h-[1.25rem] role="alert"|"status" aria-live="polite"`
- `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer is:inline>` once on the page
- Submit handler: `e.preventDefault()`, read `cf-turnstile-response` value, fetch JSON, parse `{ message?: string; error?: string }`, reset form + `(window as any).turnstile.reset()` on success.

### API route response shape
**Source:** `apps/web/src/pages/api/subscribe.ts` lines 15, 22, 26, 32, 59, 88, 93
**Apply to:** delete-request.ts
- Success: `Response.json({ message: "..." })` (200)
- Validation failure: `Response.json({ error: "..." }, { status: 400 })`
- Server failure: `Response.json({ error: "..." }, { status: 500 })`

### WebCrypto-only (no Node `crypto`)
**Source:** `packages/schema/src/index.ts` lines 81-87 (`sha256Hex`)
**Apply to:** google-indexing.ts — use `jose` library (which uses WebCrypto under the hood); never import `node:crypto`. CLAUDE.md hard rule "Edge only" + RESEARCH Standard Stack.

### Migration `wind_turbine` placeholder
**Source:** `packages/schema/src/migrations/0001_initial.sql` line 2
**Apply to:** 0004_stale_jobs_consent.sql
```
-- Replace every occurrence of «wind_turbine» with your niche's schema name before running.
```
The provision script substitutes; in the file we author `wind_turbine` as the literal placeholder.

## No Analog Found

None — every file in scope has either an exact analog (existing file being modified) or a strong role-match analog in the codebase. The only genuinely new tech is the `jose` JWT signing in `google-indexing.ts`, but the surrounding HTTP-fetch wrapper pattern is borrowed cleanly from `lib/turnstile.ts` and `lib/resend.ts`.

## Metadata

**Analog search scope:** `packages/schema/src/migrations/`, `workers/ingest/src/`, `apps/web/src/pages/`, `apps/web/src/pages/api/`, `apps/web/src/components/`, `apps/web/src/lib/`
**Files scanned (and read in full):** 19 source files
**Pattern extraction date:** 2026-05-09
