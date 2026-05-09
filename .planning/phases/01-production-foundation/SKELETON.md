# Walking Skeleton — OwlJobs (Wind Turbine Jobs)

**Phase:** 1
**Generated:** 2026-05-09

## Capability Proven End-to-End

A visitor on `windturbinejobs.com` can: browse niche-classified job listings rendered by Astro 5 SSR (data from Supabase per-niche schema `wind_turbine`), open a detail page, click "Apply" to the employer's ATS, AND subscribe by email — receiving a Resend-delivered confirmation that respects RFC 8058 one-click unsubscribe headers. The Cloudflare Worker `workers/ingest` runs hourly: ATS fetch → classify (Workers AI) → enrich (HTML descriptions) → DB write, with a Pages-rebuild webhook on enrich completion.

## What the Skeleton Already Provides (Pre-Phase-1)

| Layer | Component | Status |
|---|---|---|
| Framework | Astro 5 SSR (`@astrojs/cloudflare` adapter, `output: server`) on Cloudflare Pages | Live |
| Edge runtime | Cloudflare Workers + Pages, `nodejs_compat` flag for `workers/ingest` | Live |
| Multi-niche | `@owljobs/niches` registry + `nicheFromHost(...)` middleware → `Astro.locals.niche` | Live |
| Database | Supabase Postgres, schema-per-niche (`wind_turbine` schema applied via 0001_initial.sql) | Live (RLS + multi-niche subscribers migrations 0002, 0003 NOT YET applied to prod) |
| Ingest worker | Hourly cron → `Promise.allSettled` per ATS adapter (Workday, Greenhouse, SuccessFactors, Recruitee, Softgarden) → `upsertJob` → enqueue classify | Live |
| Classify worker | Workers AI (`@cf/baai/bge-small-en-v1.5` embedding) + heuristic vs `classificationExemplars` | Live |
| Enrich worker | Fetches employer apply-page HTML, sanitizes via `dompurify` (no-DOM mode), stores | Live |
| Frontend reads | `apps/web/src/lib/jobs.ts` — `listJobs`, `getJobBySlug`, `listEmployerJobs`, `listFeedJobs`, `listSitemapJobs`, `getStats`. All filter `classification_score >= 0.5`. | Live |
| Subscribe flow | `Newsletter.astro` → `/api/subscribe` (Turnstile + per-niche Resend confirmation) → `/api/confirm` → confirmed row in DB | Live |
| Unsubscribe flow | `/api/unsubscribe?token=...` GET (HTML page) and POST (RFC 8058 one-click). `List-Unsubscribe` + `List-Unsubscribe-Post` headers set in `lib/resend.ts` `sendConfirmation`. | Live (verification only in this phase) |
| Bot protection | Cloudflare Turnstile via `lib/turnstile.ts`; site key inlined as `data-sitekey` on prerendered pages | Live |
| Privacy page | `/privacy` (prerender) — sub-processor table, retention, GDPR rights summary | Live (deletion form + multi-niche text additions in this phase) |
| Sitemap / feeds | `/sitemap.xml`, `/feed.xml` (RSS), `/feed.json` — all delegate to `lib/jobs.ts` | Live |

## What Phase 1 Adds (Per Plan)

| Plan | Slice | Key Artifact(s) |
|---|---|---|
| 01 | Stale jobs — DB + worker | `packages/schema/src/migrations/0004_stale_jobs_consent.sql` (jobs.status, jobs.expired_at, subscribers.consent_given_at, RLS update); `workers/ingest/src/expire.ts` (`expireMissingJobs`, `cleanupExpired`); `workers/ingest/src/google-indexing.ts` (`pingUrlUpdated` via `jose` RS256 JWT); `ingest.ts` returns fetched-ID sets + 23505 reactivation; `index.ts` wires cleanup; `wrangler.toml` documents `GOOGLE_INDEXING_KEY` Worker secret; root `vitest.config.ts` + test scaffolds (Wave 0). |
| 02 | Stale jobs — frontend | `lib/jobs.ts` adds `.eq("status", "active")` to `listJobs`, `listFeedJobs`, `listSitemapJobs`, `listEmployerJobs`, `getStats` (NOT `getJobBySlug`); `pages/jobs/[slug].astro` adds `Astro.response.status = 410` branch + short-cache override + minimal "no longer available" body. |
| 03 | GDPR consent | `Newsletter.astro` adds required consent checkbox + multi-niche label text + client-side guard; `/api/subscribe` requires `consent: true` in body and writes `consent_given_at = NOW()`. |
| 04 | GDPR deletion | `/privacy.astro` appends "Request data deletion" form section with Turnstile + client-side fetch; new `/api/delete-request.ts` (Turnstile verify → email `privacy@${niche.domain}` via Resend); `lib/resend.ts` adds `sendDeletionRequest` helper. |
| 05 | Ops runbook | Apply 0002+0003+0004 via Supabase SQL editor; Resend domain DNS (SPF/DKIM/DMARC) on Cloudflare DNS; 6 Pages secrets + 3 Worker secrets via wrangler; GCP service account + Indexing API enable + JobPosting allow-list submission; deploy + smoke. |
| 06 | INFRA-07 verification | No code. Inbox + curl checks confirming RFC 8058 headers and one-click POST handler work end-to-end on the live deploy. |

## Stack Touched in Phase 1

- [x] Project scaffold — already in place; Plan 01 adds `vitest@^4.1.5` + `@vitest/coverage-v8` at workspace root
- [x] Routing — `/jobs/[slug]` extended with 410 branch (Plan 02); `/api/delete-request` added (Plan 04)
- [x] Database — migration 0004 (Plan 01) adds `jobs.status`, `jobs.expired_at`, `subscribers.consent_given_at`; Plan 03 writes `consent_given_at`
- [x] UI — consent checkbox (Plan 03), deletion form on `/privacy` (Plan 04), 410 page body (Plan 02)
- [x] Deployment — Plan 05 runbook covers Supabase migrations, Resend DNS, Cloudflare secrets, GCP, `wrangler pages deploy`, `wrangler deploy --cwd workers/ingest`

## Post-Phase-1 Deployment Check

Run from a clean shell after all plans are merged:

```bash
# 1. Apply migration to prod
#    (manual — paste packages/schema/src/migrations/0004_stale_jobs_consent.sql
#     into Supabase Dashboard → SQL Editor → Run, replacing «wind_turbine» if applicable)

# 2. Deploy frontend + worker
pnpm --filter @owljobs/web build && pnpm wrangler pages deploy apps/web/dist --project-name owljobs
pnpm --filter @owljobs/ingest deploy

# 3. Functional smoke tests
curl -sI https://windturbinejobs.com/                     # 200 OK, Cache-Control present
curl -sI https://windturbinejobs.com/sitemap.xml          # 200 OK, application/xml
curl -sI https://windturbinejobs.com/feed.xml             # 200 OK, application/rss+xml
curl -sI https://windturbinejobs.com/privacy              # 200 OK, contains deletion form

# 4. Manually trigger ingest cron (debug endpoint already in workers/ingest/src/index.ts)
curl -s "https://owljobs-ingest.<account>.workers.dev/ingest-now" | jq

# 5. After cron run completes, find an expired job from logs and verify 410:
curl -sI https://windturbinejobs.com/jobs/<expired-slug>  # MUST be: HTTP/2 410, Cache-Control: max-age=0

# 6. Subscribe smoke test (real email):
#    Visit https://windturbinejobs.com/, tick consent checkbox, submit valid email,
#    confirm Resend email arrives from noreply@windturbinejobs.com,
#    contains List-Unsubscribe + List-Unsubscribe-Post: List-Unsubscribe=One-Click headers,
#    click confirmation link → confirmed_at set in DB,
#    click unsubscribe link in inbox UI → row deleted.
```

If all six steps pass, the walking skeleton has been extended to production-ready Phase 1.

## Out of Scope (Deferred)

- Job creation / description-update Indexing API pings — Phase 2 (SEO-03) extends `google-indexing.ts` once the auth setup lands here
- `JobPosting` JSON-LD on detail pages — Phase 2 (SEO-01)
- Description enrichment shipping for all relevant jobs — Phase 2 (SEO-02), already partially live via `enrich.ts`
- ATS auto-discovery, Adzuna fallback, employer breadth → Phase 2
- Weekly digest, double-opt-in growth → Phase 3
- Magic-link employer dashboard, featured jobs, claim flow → Phase 4
- Stripe billing, EU VAT, customer portal → Phase 5
- Multi-niche activation (niche 2+) — architecture is ready; activation gated on Phase 1's MRR proof

## Subsequent Slice Plan

- **Phase 2:** Employer breadth + JSON-LD + Indexing API on creation/update + auto-discovery
- **Phase 3:** Weekly digest cron→queue→Resend with idempotency + ≥100 confirmed subscribers gate
- **Phase 4:** Auto-generated `/employers/[slug]` pages + magic-link login + featured-jobs toggle + analytics dashboard
- **Phase 5:** Stripe billing webhook (`constructEventAsync`) + `stripe_events` idempotency + EU VAT/VIES + Customer Portal + manual onboarding
