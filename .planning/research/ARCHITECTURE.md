# Architecture Research: Employer Monetization on OwlJobs

**Domain:** Niche job board → employer subscription SaaS
**Researched:** 2026-05-09
**Constraint:** Cloudflare-only edge stack (Workers, Pages, Queues, Cron) + Supabase Postgres + Astro SSR. No Redis, no separate auth service, no traditional server.
**Overall confidence:** HIGH on the core auth/billing/cron path (these are well-trodden patterns on this exact stack); MEDIUM on auto-discovery and featured-sort tradeoffs.

---

## Summary

The existing edge-native stack already contains every primitive needed for employer monetization. No new runtime is required.

- **Auth:** Supabase Auth, cookie-session via `@supabase/ssr`, in Astro middleware. Cloudflare Access is not appropriate (it gates an entire app behind an IdP — wrong tool for a public-facing portal with self-serve employer login).
- **Subscription state:** Stored in Supabase as a dedicated `employer_subscriptions` table (per niche schema), written *only* by the Stripe webhook worker (service role), read by RLS-protected policies. Stripe is the source of truth; Supabase is the read-side cache.
- **Stripe webhooks:** Dedicated Cloudflare Worker (separate from `workers/ingest`) — `workers/billing` — verifies signature with `stripe.webhooks.constructEventAsync` + WebCrypto `CryptoProvider`, deduplicates by `event.id` against a `stripe_events` table, returns 200 within 10s, defers heavy work to a `owljobs-billing` queue.
- **Featured sort:** A single `featured_until TIMESTAMPTZ` column on `jobs` (NULL = not featured). `ORDER BY (featured_until > NOW()) DESC, posted_at DESC` with a partial index. No score, no separate table. Time-bounded so featured slots auto-expire.
- **Company page editing:** Astro form POST → API route → Supabase RLS policy `employer_id = (auth.jwt() ->> 'employer_id')::uuid AND tier IN ('pro','enterprise')`. Edits write to `employers.profile_jsonb` + trigger Pages rebuild via existing `PAGES_DEPLOY_HOOK`.
- **Auto-discovery:** A standalone Worker (or local Node script) that, given `{company_name, domain}`, probes well-known ATS URL patterns (`{slug}.myworkdayjobs.com`, `boards.greenhouse.io/{slug}`, `careers-{slug}.successfactors.com`, `{slug}.recruitee.com`, `{slug}.softgarden.io`) and parses career-page HTML for known fingerprints (`Powered by Workday`, `greenhouse-board`, `BizX` markers).
- **Email digest:** Cloudflare Cron at 06:00 UTC fans out per-niche digest jobs to a new `owljobs-digest` queue with `max_batch_size: 2` to honor Resend's 2 req/sec default. No Redis-style deduplication needed — `email_sends` table with `(subscriber_id, digest_date)` unique constraint enforces one-send-per-day.

---

## 1. Employer Authentication

### Recommendation: Supabase Auth + `@supabase/ssr`, magic-link primary

**Why not Cloudflare Access:**
Cloudflare Access is a Zero Trust perimeter product — it puts an IdP (Google/Okta/email OTP) in front of an entire hostname. It's designed for internal apps, not for public SaaS where any employer can sign up and bring their own credentials. The auth artifact (Cloudflare's `CF_Authorization` JWT) does not interoperate cleanly with Supabase RLS, and it can't be self-served (each tenant requires admin work in the Cloudflare dashboard). Wrong tool. (Cloudflare Community thread confirms this is a recurring point of confusion.) — MEDIUM

**Why not custom JWT:**
Reinventing session refresh, password reset, email verification, OAuth flows is weeks of work that delivers nothing the founder can sell. Supabase Auth is already in the project's dependency footprint via `@supabase/supabase-js`. — HIGH

**Why Supabase Auth (cookie-session):**
- Already part of the stack — zero new infra.
- `@supabase/ssr` (v0.10.0+) handles cookie-based sessions with proper `Cache-Control` headers so Cloudflare CDN does not cross-pollute sessions between users (a real footgun documented in the SSR repo). — HIGH
- RLS integration is native: `auth.uid()` and `auth.jwt()` are first-class in Postgres policies. — HIGH
- Magic link works well for low-volume founder-led onboarding (no password UX to build, no support requests for forgotten passwords).

**Implementation outline:**
```
apps/web/src/middleware.ts          ← creates request-scoped Supabase client from cookies
apps/web/src/lib/supabase-server.ts ← createServerClient with cookies.getAll/setAll
apps/web/src/pages/employer/login.astro
apps/web/src/pages/employer/dashboard/*.astro
apps/web/src/pages/auth/callback.ts ← magic-link callback
```

The middleware reads cookies, instantiates a per-request client, exposes it as `Astro.locals.supabase` and `Astro.locals.session`. Protected routes redirect to `/employer/login` on null session.

**Custom claim for tenancy:** Add `employer_id` to the JWT via Supabase Auth Hooks (custom access token hook) so RLS policies can read `auth.jwt() ->> 'employer_id'` without a join. This is the standard multi-tenant pattern. — HIGH

**Critical CDN gotcha:** Any Astro page that touches `Astro.locals.session` MUST set `Cache-Control: private, no-store` (or rely on `@supabase/ssr` v0.10+ doing this automatically on token refresh). The current `setCacheHeaders(headers, 300, 600)` pattern in `apps/web/src/lib/cache.ts` MUST NOT be applied to authenticated routes. — HIGH

---

## 2. Subscription State in Supabase + RLS

### Recommendation: Two-table split — `employer_subscriptions` (service-role write) + `employers.tier` (denormalized cached column)

**Schema (per-niche, e.g. `wind_turbine.employer_subscriptions`):**
```sql
CREATE TABLE wind_turbine.employer_subscriptions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id           UUID NOT NULL REFERENCES wind_turbine.employers(id) ON DELETE CASCADE,
  stripe_customer_id    TEXT NOT NULL UNIQUE,
  stripe_subscription_id TEXT NOT NULL UNIQUE,
  status                TEXT NOT NULL,           -- active | trialing | past_due | canceled | unpaid
  tier                  TEXT NOT NULL,           -- basic | pro | enterprise
  current_period_end    TIMESTAMPTZ NOT NULL,
  cancel_at_period_end  BOOLEAN NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Denormalized cache on employers for fast RLS checks
ALTER TABLE wind_turbine.employers
  ADD COLUMN tier TEXT NOT NULL DEFAULT 'free',
  ADD COLUMN subscription_active BOOLEAN NOT NULL DEFAULT false;
```

**Why split:**
The community-recommended pattern (DEV / Makerkit) is to put `subscription_tier` in a separate table that *only* `service_role` writes, then either denormalize a single column to the parent for cheap RLS reads, or join. — MEDIUM

The denormalized `tier` + `subscription_active` columns on `employers` keep RLS policies fast and readable:

```sql
-- Pro tier required to edit company page
CREATE POLICY "pro_can_edit_profile" ON wind_turbine.employers
FOR UPDATE TO authenticated
USING (
  id = ((auth.jwt() ->> 'employer_id')::uuid)
  AND subscription_active = true
  AND tier IN ('pro', 'enterprise')
)
WITH CHECK (
  id = ((auth.jwt() ->> 'employer_id')::uuid)
  AND subscription_active = true
  AND tier IN ('pro', 'enterprise')
);
```

**Why not Stripe Sync Engine for v1:**
Supabase's Stripe Sync Engine mirrors the entire Stripe schema (customers, subscriptions, invoices, payment_intents…) into Postgres via webhooks. — HIGH. It's powerful but:
- Currently requires a Fastify/Node runtime (open issue #33 requesting Cloudflare Worker support); does not run as a pure Worker. — HIGH
- Mirroring all of Stripe is overkill for 5 employers; we only need `subscription.status` and `tier`.
- Adds an opaque dependency. The webhook → table write is ~80 lines of code we should own.

**Revisit when:** >50 paying employers, or we want analytics queries across invoices/payments. Until then, custom webhook handler.

**Stale-cache repair:**
A small daily Cron worker reconciles by calling `stripe.subscriptions.list({ status: 'all' })` and updating any drift. Insurance against missed/dropped webhooks. — MEDIUM

---

## 3. Stripe Webhook Handling on Cloudflare Workers

### Recommendation: Dedicated `workers/billing` Worker, signature verify with WebCrypto, idempotent via `stripe_events` table, defer to queue

**Architecture:**
```
Stripe → POST https://billing.windturbinejobs.com/webhook
       → workers/billing (Cloudflare Worker)
         1. Read req.text() (RAW body — required for signature)
         2. stripe.webhooks.constructEventAsync(body, sig, secret, undefined, Stripe.createSubtleCryptoProvider())
         3. INSERT INTO stripe_events (id, type, payload) ON CONFLICT (id) DO NOTHING
         4. If conflict (already seen) → return 200 immediately
         5. Else → enqueue { event_id } to owljobs-billing queue
         6. Return 200
       → owljobs-billing consumer
         → process event (update employer_subscriptions, update employers.tier cache)
         → mark stripe_events.processed_at = NOW()
```

**Why this shape:**

1. **Raw body:** Stripe signature verification requires the unmodified request body. In Workers, `req.text()` returns the raw bytes as a string; do NOT call `req.json()` first. Hono's `c.req.text()` works the same. — HIGH (consistent across all sources: Stripe docs, Hono docs, jross.me, hono-stripe-webhook-middleware-lite README).

2. **WebCrypto provider:** The standard Stripe Node SDK's synchronous `constructEvent` uses Node's `crypto`, which does not exist on Workers. Use `constructEventAsync` with `Stripe.createSubtleCryptoProvider()`. Cloudflare's announcement post documents this exact pattern as the supported way. — HIGH

3. **Idempotency at the database, not the Worker:** Stripe will retry on any non-2xx response, and even on success it occasionally sends duplicates. The bulletproof pattern is a `stripe_events` table with `id` as primary key and `INSERT ... ON CONFLICT (id) DO NOTHING`. This single Postgres constraint is the deduplication primitive — no Redis, no Durable Object, no in-memory cache. — HIGH

4. **Return 200 fast, process async:** Stripe times out webhooks at ~10s and starts retrying. By writing the event to the `stripe_events` table and enqueueing a queue message, the Worker returns in ~50ms. The consumer Worker does the actual subscription update. Same pattern as the existing classify/enrich pipeline — fits the codebase's existing mental model. — HIGH

**Tables:**
```sql
-- Public schema (not per-niche — billing is global)
CREATE TABLE public.stripe_events (
  id            TEXT PRIMARY KEY,        -- evt_xxx from Stripe
  type          TEXT NOT NULL,           -- e.g. customer.subscription.updated
  niche_id      TEXT,                    -- resolved from customer metadata
  payload       JSONB NOT NULL,
  received_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at  TIMESTAMPTZ,
  error         TEXT
);
CREATE INDEX ON public.stripe_events (received_at DESC) WHERE processed_at IS NULL;
```

The `niche_id` is set from `event.data.object.customer` → look up `stripe_customers` table → know which niche schema to write to. Store `niche_id` in Stripe customer `metadata` at checkout creation time so the webhook never has to guess.

**Events to handle (minimum set):**
- `checkout.session.completed` → create subscription row, set tier
- `customer.subscription.updated` → update tier, period_end, cancel_at_period_end
- `customer.subscription.deleted` → set status=canceled, subscription_active=false
- `invoice.payment_failed` → set status=past_due (still allow access for grace period)
- `invoice.payment_succeeded` → reset status=active

**SDK choice:** Use `stripe` (official Node SDK) — Cloudflare announced native Workers support. The lighter `hono-stripe-webhook-middleware-lite` is also viable if bundle size matters, but the official SDK is fine for a billing-only Worker. — HIGH

---

## 4. Featured Placement Sorting

### Recommendation: `featured_until TIMESTAMPTZ` column on `jobs`, partial index, simple ORDER BY

**Schema:**
```sql
ALTER TABLE wind_turbine.jobs
  ADD COLUMN featured_until TIMESTAMPTZ;

-- Partial index: small (only featured jobs), used by ORDER BY tiebreak
CREATE INDEX jobs_featured_active_idx
  ON wind_turbine.jobs (featured_until DESC, posted_at DESC)
  WHERE featured_until > NOW();
```

**Query in `listJobs` (modify `apps/web/src/lib/jobs.ts`):**
```sql
SELECT * FROM wind_turbine.jobs
WHERE classification_score >= 0.5
ORDER BY (featured_until > NOW()) DESC NULLS LAST, posted_at DESC
LIMIT 20 OFFSET ?;
```

**Why this over a `score` column:**

- **Time-bounded automatically.** A boolean `is_featured` is operationally awful — someone has to remember to flip it back when a subscription cancels or expires. `featured_until` self-expires. The job stays in the table; only its sort position changes.
- **No ranking complexity.** Score-based ordering ("how featured?") implies a UI showing tiers of featured-ness, which we don't have and shouldn't build for v1. A job is either featured (above the fold) or it's not.
- **Cheap to index.** A partial index `WHERE featured_until > NOW()` stays tiny because in practice <5% of jobs are featured at any time.
- **Easy to reason about.** "Show me featured jobs for employer X" → `WHERE employer_id = X AND featured_until > NOW()`. No threshold tuning.

**Note on Postgres boolean sort:** In Postgres, `TRUE > FALSE`, so `ORDER BY (featured_until > NOW()) DESC` puts featured jobs first. NULLS LAST ensures the NULL case (not featured) doesn't sneak ahead. Confirmed in PostgreSQL docs and a Django ticket about cross-DB boolean sort behavior. — HIGH

**Featured slot enforcement (anti-spam):**
Add a CHECK or trigger that limits featured jobs per employer based on tier:
```sql
-- Pro: 5 featured slots, Enterprise: unlimited
-- Enforced application-side in the "feature this job" API endpoint, not as a DB constraint
-- (cheaper to compute on write than to enforce as a CHECK across rows)
```

**Display ordering tiebreak:**
Within the featured group, sort by `featured_until DESC` (jobs that paid for longer windows surface first), then `posted_at DESC`.

---

## 5. Company Page Editing

### Recommendation: Astro form POST → API route → Supabase RLS UPDATE → trigger Pages rebuild

**Storage:** Add a `profile_jsonb` column on `employers` (per niche schema). Don't proliferate columns for fields that may not exist for every employer.

```sql
ALTER TABLE wind_turbine.employers
  ADD COLUMN profile_jsonb JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN logo_url TEXT,
  ADD COLUMN website TEXT,
  ADD COLUMN profile_updated_at TIMESTAMPTZ;
```

Schema for `profile_jsonb` (not enforced by Postgres, validated in app):
```typescript
{
  description: string,        // 200-2000 chars, sanitized HTML or markdown
  founded_year?: number,
  size_range?: '1-10' | '11-50' | '51-200' | '201-500' | '500+',
  industries?: string[],      // free-tag for now
  benefits?: string[],
  social?: { linkedin?: string, twitter?: string, youtube?: string }
}
```

**Why JSONB:** Profile fields evolve fast in the early product phase. Adding a new column requires a migration; adding a key to JSONB requires only frontend work. JSONB is queryable when you eventually need it (e.g. `WHERE profile_jsonb ->> 'size_range' = '500+'`). Standard pattern in Supabase + Astro starter projects. — MEDIUM

**Edit flow:**
```
GET  /employer/dashboard/profile       → loads form pre-filled
POST /api/employer/profile             → validates, updates via RLS-scoped client
                                       → POST to PAGES_DEPLOY_HOOK
                                       → returns success + ETA
```

**RLS (already shown above):** Only the employer owner with `tier IN ('pro','enterprise')` can UPDATE.

**HTML sanitization:** Description field accepts user HTML. MUST run through a sanitizer like `dompurify` (works in Workers — it has a no-DOM mode) or `sanitize-html` (Node-only — won't work). Whitelist `<p>, <a>, <ul>, <li>, <strong>, <em>, <br>` only. Critical security boundary — without it, employers can XSS visitors to their company page. — HIGH

**Image uploads (logo):** Use Supabase Storage. Public bucket, employer-id-scoped path: `logos/{employer_id}.{ext}`. RLS policy on the bucket mirrors the `employers` UPDATE policy. — HIGH

**Rebuild trigger:** Reuse the existing `PAGES_DEPLOY_HOOK` mechanism the enrich worker already uses. Debounce: only fire if no rebuild has been triggered in the last 60s (track in a small `pages_rebuild_log` table or simply tolerate occasional double-rebuilds — they're cheap). — HIGH

**Alternative considered & rejected — runtime SSR fetch only, no rebuild:**
Since pages are SSR'd anyway, the profile edit could just live in the database and surface on next request. That works, BUT the existing Cache-Control of 5min/10min SWR means edits could be invisible for 10+ minutes. Triggering a rebuild forces fresh content. For employer-edited content where they expect "publish = visible," the rebuild is worth it.

---

## 6. Auto-Discovery: Detect ATS Platform from Domain/Company

### Recommendation: Standalone Worker (or Node CLI), URL-pattern probe + HTML fingerprint, score and rank

This is the highest-uncertainty area in the research. — MEDIUM

**Detection cascade (cheapest signals first):**

**Stage A — URL pattern probe (fast, no scraping):**
Given a company name `acme-energy` and/or domain `acme-energy.com`, generate slug variants (`acme`, `acmeenergy`, `acme-energy`, `acme_energy`) and HEAD-request known ATS hostnames:

| ATS | URL probe |
|-----|-----------|
| Workday | `https://{slug}.wd1.myworkdayjobs.com/{slug}` (try wd1–wd12) — also `{slug}.workday.com` |
| Workday (alternate) | `https://wd5-services1.myworkday.com/ccx/...` (uncommon for public) |
| Greenhouse | `https://boards.greenhouse.io/{slug}` and JSON: `https://boards-api.greenhouse.io/v1/boards/{slug}/jobs` |
| Lever | `https://jobs.lever.co/{slug}` and JSON: `https://api.lever.co/v0/postings/{slug}` |
| SmartRecruiters | `https://jobs.smartrecruiters.com/{slug}` and JSON: `https://api.smartrecruiters.com/v1/companies/{slug}/postings` |
| Ashby | `https://jobs.ashbyhq.com/{slug}` |
| Recruitee | `https://{slug}.recruitee.com` and JSON: `https://{slug}.recruitee.com/api/offers` |
| Softgarden | `https://{slug}.softgarden.io/en/vacancies` |
| SuccessFactors | `https://career.{slug}.com/career` and `https://{slug}.successfactors.com/career` (less stable) |

A 200 OK on the JSON endpoints is high-confidence (HIGH). A 200 on the HTML page warrants a second-stage check.

**Stage B — Career-page HTML fingerprint:**
Fetch the company's `https://{domain}/careers` (and `/jobs`, `/work-with-us`) and grep for ATS-specific markers:

| ATS | HTML fingerprint |
|-----|------------------|
| Workday | `myworkdayjobs.com` in iframe src, `wd-application` class, `Powered by Workday` text |
| Greenhouse | `greenhouse-board` div, `boards.greenhouse.io` script src, `app.greenhouse.io` |
| SuccessFactors | `careersection`, `BizX`, `successfactors`, `sf-app` markers, `careers-careersection` URL |
| Recruitee | `recruitee.com` script src, `recruitee-iframe`, `data-recruitee-` attributes |
| Softgarden | `softgarden.io` iframe, `sg-application` class |
| iCIMS | `icims.com`, `iCIMS_` JS variables |
| Lever | `jobs.lever.co` iframe |

**Stage C — Confidence scoring:**
Score each ATS (0–100) based on evidence: JSON endpoint 200 = +60, slug variant matches = +20, fingerprint match = +30, HTML iframe pointing at platform = +40. Top score above 70 → confident; 40–70 → flag for manual review; <40 → "ATS unknown."

**Worker shape:**
```
workers/discover/
  src/index.ts           ← cron OR HTTP-triggered: read employers from longlist table, run discovery
  src/probe.ts           ← URL pattern probe with 1.5s timeout, parallel via Promise.allSettled
  src/fingerprint.ts     ← HTML grep for ATS markers
  src/score.ts           ← combine signals into confidence score
```

Persist results to `public.discovery_candidates`:
```sql
CREATE TABLE public.discovery_candidates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  niche_id        TEXT NOT NULL,
  company_name    TEXT NOT NULL,
  company_domain  TEXT,
  detected_ats    TEXT,                  -- workday | greenhouse | ...
  detected_slug   TEXT,                  -- the params for the adapter
  confidence      INT NOT NULL,          -- 0-100
  evidence        JSONB NOT NULL,        -- which probes matched
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

**Why a Worker (not just a local script):**
- Reuses Workers' fetch (no `node-fetch` install dance).
- Can be run as a one-off via `wrangler deploy` + HTTP trigger, OR scheduled weekly.
- Can run from EU/US edges to detect geo-gated pages.
- BUT: a local Node CLI is fine for v1 — the founder runs it once on the longlist, reviews results manually, copies confirmed entries into the `niche.atsTargets` config. This is the lowest-risk start.

**Critical limitation:** ATS auto-discovery is fundamentally heuristic. Some employers run their own custom careers software with no ATS, some use multiple ATSs (parent vs subsidiary), some have ATS but block bots. Plan for ~60–70% auto-detection success and manual fallback for the rest. — MEDIUM. (No published "fingerprinting database" exists; we are building it ourselves.)

**Reference projects:** `OpenJobRadar` integrations page lists 12+ ATS platforms with URL patterns; the Apify `multi-ats-jobs-scraper` exposes the explicit `{ats}:{slug}` format documenting the slug-based detection. — MEDIUM

---

## 7. Email Digest Worker

### Recommendation: Cron @ 06:00 UTC → fan out to `owljobs-digest` queue → consume with `max_batch_size: 2` to honor Resend rate limit

**Why this shape, no Redis needed:**

The Resend free/standard plan limits to 2 requests/second. Cloudflare Queues' `max_batch_size` consumer setting is the documented mechanism for honoring third-party rate limits — confirmed in Cloudflare's own Queues rate-limit tutorial. — HIGH

**Architecture:**
```
Cron (06:00 UTC daily) in workers/ingest/src/index.ts
  → for each registered niche:
      → SELECT subscribers WHERE confirmed_at IS NOT NULL
      → for each subscriber:
          → SELECT new jobs WHERE classification_score >= 0.5
                              AND posted_at > (now - 24h)
                              AND id NOT IN (SELECT job_id FROM email_sends WHERE subscriber_id = ?)
          → if jobs.length > 0:
              → enqueue { subscriber_id, niche_id, job_ids } to owljobs-digest

Consumer: workers/ingest/src/digest.ts (new)
  → max_batch_size: 2, max_batch_timeout: 30s
  → for each message:
      → render digest HTML (Astro Component or string template)
      → POST to Resend /emails (or batch endpoint)
      → INSERT INTO email_sends (subscriber_id, job_ids, sent_at, type='digest')
      → on success: msg.ack()
      → on failure: msg.retry() (exponential backoff up to 3 attempts)
```

**Wrangler config (`wrangler.toml` of `workers/ingest`):**
```toml
[triggers]
crons = ["*/15 * * * *", "0 6 * * *"]    # existing ingest + new digest

[[queues.consumers]]
queue = "owljobs-digest"
max_batch_size = 2          # respects Resend 2 req/sec
max_batch_timeout = 30      # waits up to 30s to fill batch
max_retries = 3
dead_letter_queue = "owljobs-digest-dlq"
```

**Resend batch endpoint:**
Resend has a `/emails/batch` endpoint that accepts up to 100 emails in one call (subject to your plan's rate limits). For volumes <500 subscribers/day, single-send is simpler and the queue rate-limiting handles throughput. Switch to batch endpoint when subscriber count justifies the complexity. — MEDIUM (batch endpoint exists; exact per-call cap I would verify against current Resend docs at integration time).

**Idempotency via DB constraint, not state:**
```sql
ALTER TABLE wind_turbine.email_sends
  ADD CONSTRAINT email_sends_one_digest_per_day
  UNIQUE (subscriber_id, sent_date, type);

ALTER TABLE wind_turbine.email_sends
  ADD COLUMN sent_date DATE GENERATED ALWAYS AS (sent_at::date) STORED;
```

If the cron retries or runs twice (rare but possible), the unique constraint blocks duplicate sends. Same idempotency philosophy as Stripe webhooks: enforce at the data layer, not in the runtime.

**Unsubscribe links:** Each digest email MUST contain a one-click unsubscribe link with a HMAC-signed subscriber token (already exists in the codebase per the newsletter flow). RFC 8058 `List-Unsubscribe-Post` header + `mailto:` is best practice for inbox placement. — HIGH

**Empty-digest handling:** If a subscriber has zero new jobs, do NOT send. Send only when `jobs.length > 0`. Sending empty/repetitive digests is the #1 cause of unsubscribes for daily digest products.

---

## Component Boundaries (Updated System Diagram)

```
┌──────────────────────────────────────────────────────────────────┐
│  Cloudflare Cron                                                  │
│   • */15 min  → ingest                                            │
│   • 06:00 UTC → digest fan-out                                    │
│   • 03:00 UTC → stripe reconciliation (drift repair)              │
└──────────┬───────────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────────┐
│  workers/ingest      (existing)                                   │
│  workers/billing     (NEW — Stripe webhooks)                      │
│  workers/discover    (NEW — ATS auto-discovery)                   │
└──────────┬───────────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────────┐
│  Cloudflare Queues                                                │
│   • owljobs-classify   (existing)                                 │
│   • owljobs-enrich     (existing)                                 │
│   • owljobs-digest     (NEW — Resend rate-limited)                │
│   • owljobs-billing    (NEW — Stripe event processing)            │
└──────────┬───────────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────────┐
│  Supabase (Postgres)                                              │
│   per-niche:  employers · jobs · job_sources · subscribers ·     │
│               email_sends · employer_subscriptions               │
│   public:     stripe_events · stripe_customers · niche_registry ·│
│               discovery_candidates                                │
└──────────┬───────────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────────┐
│  Astro on Cloudflare Pages                                        │
│   public:    /, /jobs/[slug], /employers/[slug]                  │
│   employer:  /employer/login, /employer/dashboard,               │
│              /employer/dashboard/profile,                         │
│              /employer/dashboard/billing                          │
│   api:       /api/employer/profile, /api/employer/feature-job,   │
│              /api/checkout                                        │
│   middleware: cookie-session resolution, RLS-scoped client        │
└──────────────────────────────────────────────────────────────────┘
```

**Why three Workers, not one:**
- `workers/ingest` keeps the existing scope: ATS polling + classify/enrich consumers + digest consumer (digest is in the same niche-data domain, naturally co-located).
- `workers/billing` is isolated for security: it holds the Stripe webhook secret and service-role key. Smaller blast radius, easier to lock down.
- `workers/discover` is naturally isolated: runs rarely, makes lots of outbound HTTP, separate budget for execution time.

This mirrors the existing healthy boundary between `workers/ingest` and `apps/web` — different security context, different deploy cadence.

---

## Anti-Patterns to Avoid

### Anti-Pattern: Storing Stripe data in the per-niche schema
**Why bad:** Billing is global to the operator, not per niche. An employer paying for niche A and niche B (future) is one Stripe customer, two subscriptions. Putting `stripe_events` in `wind_turbine` schema breaks when niche 2 launches.
**Instead:** `public.stripe_events` and `public.stripe_customers`, with `niche_id` columns to scope per-niche queries. Per-niche `employer_subscriptions` is fine since employers are per-niche.

### Anti-Pattern: Enforcing tier limits with database CHECK constraints
**Why bad:** "Pro tier = 5 featured slots" requires counting other rows for the same employer in a CHECK — Postgres CHECKs are per-row, can't reference other rows of the same table without exclusion constraints which get complex fast.
**Instead:** Enforce in the `/api/employer/feature-job` endpoint: count current featured jobs for employer, reject if over tier limit. Simple, testable, easy to evolve tier limits.

### Anti-Pattern: Caching authenticated employer dashboard responses
**Why bad:** Default Cloudflare CDN caching can leak one employer's data to another. The `setCacheHeaders` helper is for public listing pages only.
**Instead:** All `/employer/*` routes set `Cache-Control: private, no-store`. Wire this into a middleware that checks for the auth cookie and skips public-cache headers.

### Anti-Pattern: Letting the webhook handler do the subscription update inline
**Why bad:** A 3-second Postgres write under load → Stripe webhook timeout (10s) → Stripe retries → duplicate work risk if not idempotent.
**Instead:** Webhook writes to `stripe_events` (single fast INSERT) + enqueues to `owljobs-billing`. Consumer does the heavy work. Returns 200 in <100ms.

### Anti-Pattern: Auto-publishing employer profile edits without rebuild
**Why bad:** SSR + 5–10 min CDN cache means edits feel broken from the employer's perspective ("I clicked save, why isn't it live?").
**Instead:** Always trigger `PAGES_DEPLOY_HOOK` after profile UPDATE. Show "Publishing… live in 1–2 minutes" in the UI.

### Anti-Pattern: Hard-deleting expired featured slots
**Why bad:** Loses billing audit trail (which employer featured which job, when, for how much).
**Instead:** `featured_until` is a timestamp; "expired" means `featured_until < NOW()`. Keep a `featured_history` audit table written on each feature event for billing/analytics.

---

## Phase Implications for Roadmap

Based on the existing phase plan in `.planning/PROJECT.md`:

| Phase | Architecture Add | Key Risk |
|-------|------------------|----------|
| Phase 2 (Employer breadth) | `workers/discover` + `discovery_candidates` table | Heuristic accuracy; manual review queue is mandatory v1 fallback |
| Phase 3 (Candidate activation) | `owljobs-digest` queue + cron + `email_sends` constraint | Resend rate limits; unsubscribe handling; empty-digest detection |
| Phase 4 (Employer product) | Supabase Auth + `@supabase/ssr` + `/employer/*` routes + `featured_until` column + RLS policies | CDN cache vs auth cookies (real footgun); HTML sanitization on profile editor |
| Phase 5 (Monetization) | `workers/billing` + `stripe_events` + `employer_subscriptions` + Stripe Checkout integration | Webhook idempotency; reconciliation cron for missed events |

**Order rationale:** The auto-discovery work (Phase 2) is the most independent — it has no auth or billing dependency. Digest (Phase 3) requires only the existing schema. Auth and `/employer/*` routes (Phase 4) must precede billing (Phase 5) because the checkout flow needs an authenticated employer to attach the customer to.

**Research flags for downstream phase research:**
- **Phase 2:** Validate ATS fingerprint patterns against the actual 150-employer longlist before committing to auto-discovery scope. Some patterns may have changed since the fingerprint table above was compiled.
- **Phase 4:** Confirm latest `@supabase/ssr` version (≥0.10.0) handles cache headers correctly on Cloudflare Pages — there were earlier versions where cookies leaked through Cloudflare CDN.
- **Phase 5:** Verify whether Stripe Sync Engine has shipped Cloudflare Worker support by the time Phase 5 starts (open issue #33). If yes, reconsider rolling our own webhook handler.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Supabase Auth on Astro/CF Pages | HIGH | Well-documented pattern; multiple production references |
| Stripe webhook on Workers (signature, idempotency) | HIGH | Cloudflare official + Stripe official + multiple community confirmations |
| RLS for subscription gating | HIGH | Standard Supabase pattern; community/MakerKit references |
| Featured sort with `featured_until` | HIGH | Postgres semantics confirmed in docs; pattern is conventional |
| Company page editing + JSONB profile | MEDIUM | Pattern is standard; XSS risk requires care |
| ATS auto-discovery | MEDIUM | URL patterns confirmed for Workday/Greenhouse/Lever/SmartRecruiters; SuccessFactors is heterogeneous; expect 60–70% auto-detect rate |
| Resend cron + queue rate-limiting | HIGH | Cloudflare Queues docs explicitly show this exact pattern |
| Stripe Sync Engine on Workers | LOW (avoidance recommended) | Confirmed open GitHub issue says no Worker support yet |

---

## Sources

- [Supabase: Server-Side Rendering / Cookie Auth](https://supabase.com/docs/guides/auth/server-side)
- [Supabase: Creating a Supabase client for SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [Supabase: Advanced SSR auth guide (cache headers, CDN)](https://supabase.com/docs/guides/auth/server-side/advanced-guide)
- [@supabase/ssr cookies + CDN issue](https://github.com/supabase/ssr/issues/36)
- [How to Build Secure SSR Auth with Supabase, Astro, Turnstile (freeCodeCamp)](https://www.freecodecamp.org/news/build-secure-ssr-authentication-with-supabase-astro-and-cloudflare-turnstile/)
- [Mihai Andrei: Supabase Auth in Astro](https://mihai-andrei.com/blog/how-to-add-supabase-auth-to-astro/)
- [Cloudflare Community: Cloudflare Access & Supabase (clarifying scope)](https://community.cloudflare.com/t/cloudflare-access-supabase/394184)
- [Cloudflare: Announcing native Stripe SDK support in Workers](https://blog.cloudflare.com/announcing-stripe-support-in-workers/)
- [stripe-samples / stripe-node-cloudflare-worker-template](https://github.com/stripe-samples/stripe-node-cloudflare-worker-template)
- [Verifying Stripe Webhook Signatures with Cloudflare Workers (jross.me)](https://jross.me/verifying-stripe-webhook-signatures-cloudflare-workers/)
- [Hono: Stripe Webhook example](https://hono.dev/examples/stripe-webhook)
- [hono-stripe-webhook-middleware-lite (no-SDK signature verify)](https://github.com/nakanoasaservice/hono-stripe-webhook-middleware-lite)
- [Supabase Stripe Sync Engine announcement](https://supabase.com/blog/stripe-sync-engine-integration)
- [Stripe Sync Engine — Cloudflare Worker support issue #33](https://github.com/supabase/stripe-sync-engine/issues/33)
- [Supabase Stripe Wrappers (FDW)](https://supabase.com/docs/guides/database/extensions/wrappers/stripe)
- [Multi-tenant SaaS auth + billing with Supabase RLS + Stripe (DEV)](https://dev.to/diven_rastdus_c5af27d68f3/how-i-built-multi-tenant-saas-auth-billing-with-supabase-rls-and-stripe-connect-3h08)
- [Supabase RLS docs (auth.uid, auth.jwt)](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Cloudflare Workers: Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [Cloudflare Queues: Handling rate limits (max_batch_size pattern)](https://developers.cloudflare.com/queues/tutorials/handle-rate-limits/)
- [Cloudflare Workers: Multiple Cron Triggers](https://developers.cloudflare.com/workers/examples/multiple-cron-triggers/)
- [Cloudflare Workers: Scheduled Handler API](https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/)
- [Sequenzy: Sending email from Cloudflare Workers (2026 Guide)](https://www.sequenzy.com/blog/send-emails-cloudflare-workers)
- [PostgreSQL Indexes and ORDER BY](https://www.postgresql.org/docs/current/indexes-ordering.html)
- [PostgreSQL Sorting Rows](https://www.postgresql.org/docs/current/queries-order.html)
- [Apify: Multi-ATS Job Scraper (slug formats for Greenhouse, Workday, Lever, SmartRecruiters, Ashby)](https://apify.com/automation-lab/multi-ats-jobs-scraper)
- [OpenJobRadar Integrations (12+ ATS list)](https://openjobradar.com/integrations)
- [Fivetran: Finding Workday Web Services URL](https://fivetran.com/docs/connectors/applications/workday-hcm/troubleshooting/get-web-services-url)
