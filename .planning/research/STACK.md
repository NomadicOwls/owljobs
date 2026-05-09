# Technology Stack — Monetization Layer

**Project:** OwlJobs — multi-niche job board (niche 1: wind turbine technicians)
**Researched:** 2026-05-09
**Scope:** Stack additions for Stripe billing, employer dashboards, email digests on existing Cloudflare Workers + Supabase + Astro SSR base
**Existing stack (locked):** Cloudflare Workers + Cloudflare Queues + Supabase Postgres + Astro SSR on Cloudflare Pages, TypeScript monorepo, Resend for email, Turnstile for bot protection
**Overall confidence:** HIGH (all recommendations verified via official docs)

---

## Executive Summary

The existing stack natively supports everything needed for monetization. **No new core infrastructure required** — only new Workers (one for Stripe webhooks, one for digest cron, optional one for employer-write API) and new Supabase tables with RLS. The single forward-looking decision is whether to migrate the Astro frontend from `@astrojs/cloudflare` on Pages to `@astrojs/cloudflare` on **Workers Static Assets** (Pages is in maintenance mode as of April 2025) — this is not blocking for monetization but should be planned within 12 months.

Headline picks:

- **Billing:** `stripe` v18+ npm SDK with `createSubtleCryptoProvider()` + `constructEventAsync()` for webhook verification. Add `nodejs_compat` flag.
- **Tax:** Stripe Tax (auto-calc) + `customer_tax_ids` for B2B reverse charge. Belgian operator → register VAT OSS.
- **Digests:** Dedicated cron Worker → enqueues per-subscriber jobs to Cloudflare Queue → consumer Worker calls Resend. Avoids 30s CPU limit.
- **Auth:** `@supabase/ssr` v0.5+ with Astro middleware. Magic-link only for employer accounts (no passwords).
- **Multi-tenancy:** `org_id` column on every employer-owned table, RLS via `auth.jwt() -> 'app_metadata' -> 'org_ids'` claim. Stripe `customer_id` lives on `organizations` table.

---

## Recommended Stack — New Components

### Billing (Stripe)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `stripe` (npm) | ^18.0.0 | Stripe SDK in Workers | Officially supported in Workers since 2024; use `Stripe.createFetchHttpClient()` and `Stripe.createSubtleCryptoProvider()` |
| Stripe Checkout (hosted) | API 2025-x | Initial subscription signup | No PCI scope, EU SCA-compliant out of the box, supports SEPA + cards |
| Stripe Customer Portal (hosted) | API 2025-x | Self-serve subscription management | Zero-code portal for upgrade/downgrade/cancel/invoice download — saves weeks of UI work |
| Stripe Tax | API 2025-x | EU VAT auto-calc + reverse charge | Validates VAT IDs via VIES, applies reverse charge to B2B EU customers automatically |
| Stripe Billing | API 2025-x | Recurring subscription engine | Native dunning, proration, trials, metered billing if needed later |

**Critical Worker config:**
```toml
# wrangler.toml for billing worker
compatibility_date = "2026-04-01"
compatibility_flags = ["nodejs_compat"]
```

**Webhook verification pattern (load-bearing — sync `constructEvent` does not work in Workers):**
```ts
const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  httpClient: Stripe.createFetchHttpClient(),
});
const cryptoProvider = Stripe.createSubtleCryptoProvider();
const event = await stripe.webhooks.constructEventAsync(
  body, signature, env.STRIPE_WEBHOOK_SECRET, undefined, cryptoProvider
);
```

### Email Digests

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Cloudflare Cron Triggers | platform | Schedule daily/weekly digest builds | Native to Workers, no external scheduler, free tier covers all needs |
| Cloudflare Queues | platform | Fan out per-subscriber sends | Queue consumers have no 30s CPU cap (only wall-time minutes), already used in ingest pipeline |
| Resend | ^4.0.0 (`resend` npm) | Transactional + digest delivery | Already in use; supports broadcasts API but per-recipient via Queue gives better personalization |

**Pattern:** Cron Worker (`scheduled()` handler) queries Supabase for active subscribers + new matching jobs in last 24h → enqueues one message per subscriber → consumer Worker renders digest HTML and POSTs to Resend. **Do not loop and send inside the cron handler** — you will hit the 30s CPU cap once subscribers > ~500.

### Authentication

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Supabase Auth | bundled with Supabase | Employer identity provider | Already provisioned, free, native RLS integration via JWT claims |
| `@supabase/ssr` | ^0.5.0 | Cookie-based SSR session for Astro | Replaces deprecated auth-helpers; handles secure cookie set/refresh on every request |
| `@supabase/supabase-js` | ^2.47.10 | Already installed | Browser + service-role client |
| Magic links (`signInWithOtp`) | — | Sole employer login method | No password reset flows to build; matches "founder-led sales" onboarding (you create the org, send the invite link) |

**No alternatives chosen** — Clerk/Auth0/Lucia were considered (see Alternatives table) but Supabase Auth is the only choice that gives RLS for free and already exists in the project.

### Employer Dashboard

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Astro SSR (existing) | ^5.7.0 | Render dashboard pages | Already in use; Astro Actions (stable since 5.0) replace dedicated API routes for most mutations |
| Astro Actions | bundled | Type-safe form handlers | RPC-style endpoints with Zod validation, callable from client + server, ideal for "save company page" / "create checkout" |
| `@owljobs/schema` (existing workspace) | workspace:* | Shared Zod schemas | Reuse for Action input validation |

### Database

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Supabase Postgres (existing) | 15.x | Add `organizations`, `subscriptions`, `stripe_events`, `org_members` tables | Already in use; RLS already enabled per migration 0002 |
| New migration `0004_employer_billing.sql` | — | Schema for employer accounts + billing | Keep convention: numbered migrations under each niche schema where applicable; cross-niche tables in `public` |

---

## Schema Sketch (informs ARCHITECTURE.md)

```sql
-- public schema (cross-niche — employers can own jobs across multiple niches eventually)
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  stripe_customer_id text unique,
  vat_number text,                   -- validated via Stripe Tax / VIES
  country_code text,
  created_at timestamptz default now()
);

create table org_members (
  org_id uuid references organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','viewer')),
  primary key (org_id, user_id)
);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  stripe_subscription_id text unique not null,
  stripe_price_id text not null,
  tier text not null,                -- 'starter' | 'growth' | 'enterprise'
  status text not null,              -- mirrors Stripe status
  current_period_end timestamptz,
  cancel_at_period_end boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Idempotency table — every webhook write inserts here first
create table stripe_events (
  id text primary key,               -- evt_... — unique constraint = dedupe
  type text not null,
  payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz default now()
);

-- RLS pattern (representative):
alter table organizations enable row level security;
create policy "members can read their orgs" on organizations
  for select using (
    id in (select org_id from org_members where user_id = auth.uid())
  );
```

**JWT claim alternative** (faster but more complex): Use a Supabase Auth Hook to inject `app_metadata.org_ids = [...]` into the JWT on each session, then write RLS policies as `id = any((auth.jwt()->'app_metadata'->'org_ids')::uuid[])`. Avoids subquery on every read. Defer until query perf shows it's needed — `org_members` will be small.

---

## EU VAT — Belgian Operator

| Concern | Approach | Notes |
|---------|----------|-------|
| Belgian B2C customers | Charge 21% Belgian VAT | Stripe Tax handles automatically once Belgian VAT registration is added |
| EU B2B customers (other member states) | Reverse charge — no VAT on invoice | Stripe Tax applies reverse charge automatically when buyer's VAT ID validates via VIES; invoice must state "VAT reverse charged" |
| EU B2C customers (other member states) | Charge buyer's local VAT rate | Requires VAT OSS registration in Belgium (single quarterly return covers all EU) |
| Non-EU customers (US, UK, etc.) | No EU VAT; check local thresholds | Stripe Tax monitors thresholds per jurisdiction |
| VAT ID collection | Stripe Checkout `customer_update.tax_id_collection: enabled` | Or via Customer Portal — set `tax_id` updates allowed in portal config |
| Invoice numbering | Belgian law requires gap-free sequential invoice numbers | Stripe auto-generates compliant numbering when "EU invoicing" enabled in Tax settings |

**Action items (not code):**
- Register Belgian VAT number before first paying customer
- Register VAT OSS in Belgium if any B2C EU sales expected (SaaS sold to consumers triggers OSS — but B2B-only avoids this)
- Enable Stripe Tax in dashboard, set business address = Belgium, upload VAT number
- All recommendations are scoped to **B2B-only** sales — consumer SaaS adds OSS complexity not in current plan

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Billing | Stripe | Paddle / Lemon Squeezy (Merchant of Record) | MoR handles VAT for you but takes 5%+ on top of Stripe; €500–€2000/mo deals make 5% material. Stripe + Stripe Tax is cheaper and you control the full data model |
| Billing | Stripe Tax | Manual VAT calculation | Belgian gap-free invoicing + VIES validation + multi-jurisdiction is not a wheel worth reinventing |
| Auth | Supabase Auth | Clerk | Clerk DX is better but adds ~$25–$300/mo; Supabase Auth costs €0 and integrates with RLS natively |
| Auth | Supabase Auth | Auth0 | Overkill for B2B SaaS at this scale; pricing escalates fast at MAU thresholds |
| Auth | Supabase Auth | Lucia / build-it-yourself | RLS requires a JWT issued by Supabase Auth or a custom JWKS. Engineering cost not justified |
| Auth | Magic links only | Email + password | Password reset flows, breach handling, password rules — none of this matters for 5–50 employer accounts. Skip it |
| Email scheduling | Cron Worker → Queue → Consumer | Single cron Worker loop | Single loop hits 30s CPU cap at ~500 subscribers; pattern needs to scale to 10k+ |
| Email provider | Resend | SendGrid / Postmark | Resend already in use, has Workers-friendly fetch SDK, deliverability is comparable. No reason to add a second provider |
| SSR session | `@supabase/ssr` | Custom JWT cookie | Library handles refresh-token rotation + cookie-on-redirect edge cases that are easy to get wrong |
| Frontend deploy | Stay on Pages (for now) | Migrate to Workers Static Assets | Pages still works; migration is mechanical but disruptive. Defer until Pages limits hit or until Astro 6 upgrade |
| Dashboard framework | Astro Actions | tRPC | Actions are native to Astro 5+, simpler, no extra dep. tRPC overkill for ~10 mutations |
| Webhook delivery | Direct webhook → Worker | Hookdeck / Svix | Stripe's own webhook reliability + idempotency table in Postgres is sufficient at this scale |

---

## Installation

```bash
# Billing Worker (new package: workers/billing)
npm install stripe@^18.0.0

# Web app (existing apps/web)
npm install @supabase/ssr@^0.5.0

# Digest Worker (new package: workers/digest)
npm install resend@^4.0.0
# (Supabase + queue bindings provided via wrangler)
```

**`wrangler.toml` additions for billing worker:**
```toml
name = "owljobs-billing"
main = "src/index.ts"
compatibility_date = "2026-04-01"
compatibility_flags = ["nodejs_compat"]

[vars]
STRIPE_API_VERSION = "2025-08-27.basil"  # pin to current stable

# Secrets (set via `wrangler secret put`):
#   STRIPE_SECRET_KEY
#   STRIPE_WEBHOOK_SECRET
#   SUPABASE_SERVICE_ROLE_KEY
#   SUPABASE_URL
```

**`wrangler.toml` additions for digest worker:**
```toml
name = "owljobs-digest"
main = "src/index.ts"
compatibility_date = "2026-04-01"

[triggers]
crons = ["0 7 * * *"]  # 07:00 UTC daily — matches morning EU inbox check

[[queues.producers]]
queue = "digest-sends"
binding = "DIGEST_QUEUE"

[[queues.consumers]]
queue = "digest-sends"
max_batch_size = 25
max_batch_timeout = 30
max_retries = 3
dead_letter_queue = "digest-sends-dlq"
```

---

## Critical Implementation Notes

These are gotchas that will burn time if not pre-known. They belong here (not PITFALLS) because they shape the stack choices.

1. **`constructEvent` must be async in Workers.** Stripe's sync verification uses Node `crypto`. Use `constructEventAsync` + `createSubtleCryptoProvider()`. Symptom of getting it wrong: webhook returns 500 immediately on signature verification.

2. **Read raw body, not parsed JSON, for signature verification.** `await request.text()` BEFORE any JSON parse. If you parse first then re-stringify, signature will not match.

3. **Webhook handler must return 200 within seconds.** Pattern: insert into `stripe_events` (PK = `evt_id` so duplicate insert errors out as dedupe), return 200 immediately, then process from a worker that polls/queues. Stripe retries up to 72h on 5xx.

4. **`platformProxy.enabled = false` is currently set in `astro.config.mjs`** with a comment about workerd / macOS 12. This is fine for now but blocks local-dev access to bindings (Queue, KV, secrets). Either upgrade local Mac to macOS 13+ or accept that bindings only work in deployed envs. Auth flows that require `Astro.cookies` work in dev because cookies don't need bindings.

5. **`@supabase/ssr` and CDN caching.** When the SSR client refreshes a JWT, it sets `Set-Cookie` on the response. If Cloudflare caches that response and serves it to another visitor, they're logged in as that user. `@supabase/ssr` v0.10+ passes `Cache-Control: no-store` automatically when refresh happens — make sure your `setAll` callback honors them. Verify with `curl -I` on a page that triggered a refresh.

6. **Cloudflare Pages is in maintenance mode (April 2025).** New features ship to Workers Static Assets, not Pages. Existing Pages projects continue to work. Plan migration to Workers when the project takes a major version bump (e.g., Astro 6) — `@astrojs/cloudflare` v13+ targets Workers. Not blocking for monetization milestone.

7. **Astro 6 is available** but project is on Astro 5.7 — do not upgrade as part of monetization milestone. Astro 6 changes local dev to use workerd (which has the macOS 12 issue), so an upgrade compounds with the platformProxy gotcha.

8. **Stripe API version pinning.** Pin via SDK constructor (`apiVersion: "2025-08-27.basil"`) — do not rely on dashboard default. Webhook payloads should be pinned too (Dashboard → Webhooks → API version).

---

## Sources

### High Confidence (official docs)
- [Stripe — Tax in the European Union](https://docs.stripe.com/tax/supported-countries/european-union)
- [Stripe — Customer Portal Configuration](https://docs.stripe.com/customer-management/configure-portal)
- [Stripe — Migrate snapshot to thin events (webhook patterns)](https://docs.stripe.com/webhooks/migrate-snapshot-to-thin-events)
- [Cloudflare — Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [Cloudflare — Workers Limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Cloudflare — Queues Limits](https://developers.cloudflare.com/queues/platform/limits/)
- [Cloudflare — Migrate from Pages to Workers](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/)
- [Cloudflare blog — Native Stripe SDK support in Workers](https://blog.cloudflare.com/announcing-stripe-support-in-workers/)
- [Astro — `@astrojs/cloudflare` adapter](https://docs.astro.build/en/guides/integrations-guide/cloudflare/)
- [Supabase — Use Supabase Auth with Astro](https://supabase.com/docs/guides/auth/quickstarts/astrojs)
- [Supabase — SSR Advanced Guide](https://supabase.com/docs/guides/auth/server-side/advanced-guide)
- [Supabase — Handling Stripe Webhooks](https://supabase.com/docs/guides/functions/examples/stripe-webhooks)
- [Supabase — Passwordless Email Logins](https://supabase.com/docs/guides/auth/auth-email-passwordless)
- [Stripe — `stripe-node-cloudflare-worker-template`](https://github.com/stripe-samples/stripe-node-cloudflare-worker-template)

### Medium Confidence (verified third-party)
- [Hono — Stripe Webhook example](https://hono.dev/examples/stripe-webhook) — confirms async crypto pattern
- [freeCodeCamp — SSR Auth with Supabase, Astro, Cloudflare Turnstile](https://www.freecodecamp.org/news/build-secure-ssr-authentication-with-supabase-astro-and-cloudflare-turnstile/) — current pattern guide (2025)
- [MakerKit — Supabase RLS Best Practices](https://makerkit.dev/blog/tutorials/supabase-rls-best-practices) — multi-tenant RLS patterns
- [Stigg — Stripe webhook best practices](https://www.stigg.io/blog-posts/best-practices-i-wish-we-knew-when-integrating-stripe-webhooks) — idempotency in production

### Confidence Assessment

| Area | Level | Basis |
|------|-------|-------|
| Stripe SDK in Workers | HIGH | Official Cloudflare blog + Stripe template repo |
| EU VAT / reverse charge via Stripe Tax | HIGH | Stripe official tax docs |
| Cron + Queue pattern for digests | HIGH | Cloudflare official docs (cron + queues + limits) |
| `@supabase/ssr` on Astro | HIGH | Official Supabase + Astro docs both reference this lib |
| Multi-tenant RLS pattern | HIGH | Multiple sources agree; pattern is well-established |
| Pages → Workers deprecation timing | MEDIUM | Confirmed deprecation; exact sunset date not announced — flag for re-check before Astro 6 upgrade |
| Stripe SDK version (^18) | MEDIUM | Verified against npm but version cadence is monthly — confirm at install time |
