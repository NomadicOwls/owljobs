# External Integrations
_Last updated: 2026-05-09_

## Summary
OwlJobs integrates with Supabase as its sole database, Cloudflare AI and Cloudflare Queues for the classification pipeline, Resend for transactional email, Cloudflare Turnstile for bot protection, and a set of ATS vendor APIs (Workday, Greenhouse, SuccessFactors, Recruitee, Softgarden) for job data ingestion. All secrets are injected as Cloudflare Worker/Pages secrets; no third-party SDK is used for email or Turnstile — both are plain fetch calls.

## Details

### Database — Supabase
- **Client:** `@supabase/supabase-js` ^2.47 (web) / ^2.49 (worker)
- **Auth mode:** `service_role` key in the worker (full access); `anon` key in the web app (RLS-restricted reads)
- **Schema isolation:** Each niche has its own Postgres schema (e.g. `wind_turbine`), selected via `supabase.schema(niche.supabaseSchema)`
- **Tables per niche schema:** `jobs`, `employers`, `job_sources`, `subscribers`
- **Migrations:** `packages/schema/src/migrations/` — 3 SQL files (`0001_initial.sql`, `0002_rls.sql`, `0003_subscribers_multi_niche.sql`)
- **Env vars:**
  - `SUPABASE_URL` — project URL (worker + web)
  - `SUPABASE_SERVICE_KEY` — service role key (worker only)
  - `SUPABASE_ANON_KEY` — anon key (web only)
- **Local dev:** credentials in `workers/ingest/.dev.vars` and `apps/web/.dev.vars` (never committed)

### AI / ML — Cloudflare Workers AI
- **Binding:** `AI` (type `Ai`) — declared in `workers/ingest/wrangler.toml` under `[ai]`
- **Embedding model:** `@cf/baai/bge-small-en-v1.5` — used for cosine-similarity classification
- **LLM model:** `@cf/meta/llama-3.1-8b-instruct` — used as arbiter for ambiguous jobs
- **Usage:** `workers/ingest/src/classify.ts` — `ai.run(model, payload)` calls
- No external AI API key; billed through Cloudflare account

### Message Queues — Cloudflare Queues
- **CLASSIFY_QUEUE** (`owljobs-classify`) — triggers classification after ingest; auto-chains if batch has more
- **ENRICH_QUEUE** (`owljobs-enrich`) — triggers description fetching for classified jobs
- Both queues: `max_batch_size = 10`, `max_retries = 2`
- Defined in `workers/ingest/wrangler.toml`; bindings typed in `Env` interface (`workers/ingest/src/index.ts`)

### Email — Resend
- **Integration:** Plain `fetch` to `https://api.resend.com/emails` (no SDK)
- **Implementation:** `apps/web/src/lib/resend.ts`
- **Flows:** subscription confirmation email, unsubscribe acknowledgement
- **Env var:** `RESEND_API_KEY` (Pages secret)
- **Headers:** `List-Unsubscribe` and `List-Unsubscribe-Post` set for RFC compliance

### Bot Protection — Cloudflare Turnstile
- **Integration:** Plain `fetch` to Turnstile verify endpoint (no SDK)
- **Implementation:** `apps/web/src/lib/turnstile.ts`
- **Usage:** Newsletter subscribe form (`apps/web/src/pages/api/subscribe.ts`)
- **Env vars:**
  - `TURNSTILE_SECRET_KEY` (Pages secret, server-side validation)
  - `TURNSTILE_SITE_KEY` (Pages secret, passed to frontend widget)

### ATS Feed Adapters (Job Data Sources)
All adapters parse public/semi-public ATS APIs. No authentication required for job listings. Implemented in `packages/ats-adapters/src/`:

| ATS | File | Notes |
|---|---|---|
| Workday | `workday.ts` | |
| Greenhouse | `greenhouse.ts` | |
| SAP SuccessFactors | `successfactors.ts` | |
| Recruitee | `recruitee.ts` | |
| Softgarden | `softgarden.ts` | |

- `sanitize.ts` — shared HTML sanitization for job descriptions
- `index.ts` — re-exports all adapters

### Deployment Webhooks — Cloudflare Pages Deploy Hook
- **Env var:** `PAGES_DEPLOY_HOOK` (optional Worker secret)
- **Trigger:** POSTed by `workers/ingest/src/index.ts` after `enrichPendingJobs` completes
- **Purpose:** Rebuild the Pages site after new job descriptions are enriched

### Hosting / Deployment
- **Web app:** Cloudflare Pages (`owljobs-web`) — SSR via `@astrojs/cloudflare`
- **Ingest worker:** Cloudflare Workers (`owljobs-ingest`) — cron every hour (`0 * * * *`)
- **Deploy commands:** `wrangler deploy` (worker), `wrangler pages deploy` (web)

### CI/CD
- No CI pipeline detected in the repository

### Monitoring / Error Tracking
- `console.log` / `console.error` only — no external error tracking service detected

## Key Facts
- Supabase is the only database; schema-per-niche pattern enables multi-niche isolation
- Cloudflare AI replaces any external LLM API — zero external AI cost
- Resend and Turnstile are integrated via raw `fetch`, not SDKs
- Five ATS vendors supported: Workday, Greenhouse, SuccessFactors, Recruitee, Softgarden
- Pages rebuild is triggered automatically from the ingest worker via deploy hook
- All secrets managed as Cloudflare Worker/Pages secrets — never in source
- No auth provider for end users (read-only public site; newsletter uses email tokens)
