# Architecture
_Last updated: 2026-05-09_

## Summary

OwlJobs is a niche job board platform built as a pnpm/Turborepo monorepo. The system has two runtime boundaries: a Cloudflare Workers ingest pipeline that pulls jobs from employer ATS systems, classifies them with AI, and writes to Supabase; and an Astro/Cloudflare Pages frontend that reads from Supabase and serves job listings. Niches (e.g. wind-turbine) are the core multi-tenancy unit — each niche maps to a Postgres schema in Supabase and a separate production domain.

## Details

### System Diagram

```
┌────────────────────────────────────────────────────────────────┐
│                  Cloudflare Cron Trigger (scheduled)           │
│                  workers/ingest — src/index.ts                 │
└───────────────────────┬────────────────────────────────────────┘
                        │ ingestNiche() per niche
                        ▼
┌───────────────────────────────────────────────────────────────┐
│  ATS Adapters  (packages/ats-adapters/src/)                   │
│  workday · greenhouse · successfactors · recruitee · softgarden│
└───────────────────────┬───────────────────────────────────────┘
                        │ raw job rows → INSERT into Supabase
                        ▼
┌───────────────────────────────────────────────────────────────┐
│  Supabase (Postgres)  — per-niche schema (e.g. wind_turbine)  │
│  tables: employers · jobs · job_sources · subscribers ·       │
│          email_sends                                          │
└────────────────┬──────────────────────────────────────────────┘
                 │            ▲
                 │ classify   │ read (anon key)
                 ▼            │
┌──────────────────────────────────────────────────────────────┐
│  Cloudflare Queues                                           │
│  owljobs-classify  →  classifyPendingJobs()  (cf Workers AI) │
│  owljobs-enrich    →  enrichPendingJobs()    (ATS desc fetch) │
└──────────────────────────────────────────────────────────────┘
                                   │ Pages deploy hook (POST)
                                   ▼
┌──────────────────────────────────────────────────────────────┐
│  Astro + Cloudflare Pages (apps/web/)                        │
│  SSR pages: /, /jobs/[slug], /employers/[slug]               │
│  API routes: /api/subscribe, /api/confirm, /api/unsubscribe  │
│  Feeds: /feed.json, /feed.xml, /sitemap.xml                  │
└──────────────────────────────────────────────────────────────┘
```

### Ingest Pipeline (3-stage queue chain)

**Stage 1 — Ingest** (`workers/ingest/src/ingest.ts`)
- Triggered by Cloudflare cron (`scheduled` handler in `workers/ingest/src/index.ts`)
- Calls ATS adapter per `niche.atsTargets` entry in parallel via `Promise.allSettled`
- Deduplicates by SHA-256 of `normalizeForKey(employer+title+location)` (from `packages/schema/src/index.ts`)
- Inserts raw rows into `jobs` table with `classification_score = NULL`
- On success: sends `{ nicheId }` message to `owljobs-classify` queue

**Stage 2 — Classify** (`workers/ingest/src/classify.ts`)
- Triggered by `owljobs-classify` queue message
- Fetches up to 100 unclassified jobs (`classification_score IS NULL`)
- Embeds job text using `@cf/baai/bge-small-en-v1.5` (Cloudflare Workers AI)
- Cosine similarity against niche-defined positive/negative exemplars
- Three-tier decision: `posScore >= 0.72` → relevant (embedding); `< 0.50 and negScore > posScore` → irrelevant (embedding); `0.50–0.72` ambiguous → LLM arbiter (`@cf/meta/llama-3.1-8b-instruct`)
- Writes `classification_score` (0.0–1.0) and `classifier` ("embedding" | "llm") back to `jobs`
- Chains itself if `hasMore` (batch limit hit); then sends to `owljobs-enrich` queue

**Stage 3 — Enrich** (`workers/ingest/src/enrich.ts`)
- Triggered by `owljobs-enrich` queue message
- Fetches up to 60 classified relevant jobs (`classification_score >= 0.5`) with `description IS NULL`
- Calls `fetchDescription()` (`workers/ingest/src/fetch-description.ts`) per ATS type
- Writes `description` HTML back to `jobs`
- Triggers Cloudflare Pages rebuild via `PAGES_DEPLOY_HOOK` (HTTP POST)

### Frontend (Astro SSR on Cloudflare Pages)

All pages are server-rendered at request time. Niche context (`Astro.locals.niche`) is resolved by host lookup from the niche registry (`apps/web/src/lib/niches.ts`).

**Key query functions** (`apps/web/src/lib/jobs.ts`):
- `listJobs(db, schema, opts)` — paginated listing, `classification_score >= 0.5` filter
- `getJobBySlug(db, schema, slug)` — slug → job detail (with employer + sources)
- `listEmployerJobs(db, schema, normalizedName)` — employer profile page
- `listFeedJobs(db, schema)` — JSON/RSS feeds (50 items)
- `listSitemapJobs(db, schema)` — sitemap (5000 items)
- `getStats(db, schema)` — hero stats (active jobs, employers, new this week)

**Cache headers** (`apps/web/src/lib/cache.ts`): `setCacheHeaders(headers, 300, 600)` — 5 min s-max-age, 10 min stale-while-revalidate on listing pages.

**Newsletter flow**: POST `/api/subscribe` → Turnstile bot check → upsert subscriber (unconfirmed) → send email via Resend → GET `/api/confirm?token=...` → set `confirmed_at` → GET `/api/unsubscribe?token=...` → delete.

### Niche Multi-tenancy

A `NicheConfig` object (defined in `packages/niches/src/index.ts`) carries:
- `id`, `domain`, `supabaseSchema` — routing and DB isolation
- `atsTargets` — which employer feeds to poll (with adapter-specific params)
- `classificationExemplars` — positive/negative example job titles for AI classifier
- `classificationPrompt` — LLM system prompt for ambiguous cases
- `branding` — colors for theming

Both the ingest worker and the web frontend maintain a module-level registry (via `registerNiche()`). The single active niche is `niches/wind-turbine.ts`. New niches are added by calling `registerNiche()` in both `workers/ingest/src/index.ts` and `apps/web/src/lib/niches.ts`.

### ATS Adapters (`packages/ats-adapters/src/`)

Each adapter (workday, greenhouse, successfactors, recruitee, softgarden) exports:
- `fetchAll*Jobs(target)` → array of normalized job rows for ingest
- `fetch*JobDescription(...)` → HTML string for description enrichment (where needed)

Greenhouse and Softgarden descriptions are fetched eagerly during ingest (available in API response). Workday, SuccessFactors, and Recruitee descriptions are fetched lazily by the enrich stage.

### Data Model (`packages/schema/src/index.ts`)

Key entities:
- `Employer` — ATS credentials, billing plan, `normalized_name` for URL slugs
- `Job` — core listing; `embedding` (vector 384d), `classification_score` (float), `classifier` enum
- `JobSource` — tracks which feeds/aggregators contributed each job
- `Subscriber` / `EmailSend` — newsletter

### Error Handling

- Ingest: `Promise.allSettled` per target; partial failures counted in stats, not fatal
- Classify queue: per-message `try/catch`; `msg.retry()` on exception, `msg.ack()` on success
- Enrich queue: same pattern; Pages rebuild only called on success
- Frontend: Supabase errors throw; caught at page level with silent empty-state degradation (see `index.astro`)

## Key Facts

- Two Cloudflare runtimes: Workers (ingest) + Pages (web frontend)
- Three-stage async pipeline: ingest → classify → enrich, chained via Cloudflare Queues
- AI classification: cosine similarity (embedding) + LLM fallback for ambiguous band (0.50–0.72)
- Multi-tenancy via Postgres schemas: each niche = one schema (e.g. `wind_turbine`)
- `classification_score >= 0.5` is the universal read-side filter on all job queries
- `PAGES_DEPLOY_HOOK` triggers Cloudflare Pages rebuild after enrich completes
- Niche registry is in-memory (module-level Map); must be kept in sync between worker and web app
- Only one niche active: `niches/wind-turbine.ts` (domain: `windturbinejobs.com`)
- Newsletter: double-opt-in via Resend email + Cloudflare Turnstile bot protection
- No server-side caching layer beyond Cloudflare CDN cache headers (5 min / 10 min SWR)
