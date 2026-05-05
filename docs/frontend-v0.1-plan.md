# OwlJobs — Frontend v0.1 (`apps/web/`)

## Context

The ingest + classify pipeline is shipped: `workers/ingest` runs hourly, scrapes Workday (GE Vernova) and SuccessFactors (Vestas, NextEra), upserts into Supabase under the `wind_turbine` schema, and classifies via Workers AI embedding similarity with Llama fallback. Current corpus: ~1000 jobs, ~31 wind-relevant in the top 100 of `jobs` ordered by `is_sponsored, posted_at DESC`. The backend exposes a debug `/jobs.json` endpoint on the ingest worker — that is not a frontend.

We need a **public-ready** candidate-facing site at `owljobs.com`: a real homepage, browsable job listings, individual job pages, an RSS/JSON feed, sitemap + robots, and a double opt-in email subscribe form. No employer dashboard, no candidate auth, no Stripe (those are v2). The site must be multi-niche-ready (host-based dispatch via `nicheFromHost`) so dropping `theme-park.ts` later is additive.

User is in `.be` (GDPR applies). User confirmed: **scope = public-ready**, **DB access = anon key + Postgres RLS**.

## Stack & key decisions

- **Astro 5** with `@astrojs/cloudflare` adapter, `output: 'server'` (Astro 5 dropped `hybrid` mode — per-route static/SSR is set with `export const prerender = true|false`).
- **Cloudflare Pages** (Pages Functions runtime via the adapter; same Cloudflare account as the workers).
- **Tailwind CSS v3** pinned (not v4 — its CSS-first config is incompatible with Astro's current integration story; revisit when Astro publishes a v4 guide).
- **Two Supabase clients**, never mixed:
  - `supabasePublic` — **anon key**, used everywhere a candidate request hits Postgres (listings, job pages, feed). Reads are gated by RLS policies that allow `SELECT` on `jobs`, `employers`, `job_sources` only when `classification_score >= 0.6` (or `is_sponsored = true`). RLS is the security boundary, not application code.
  - `supabaseAdmin` — **service-role key**, used only inside `/api/subscribe`, `/api/confirm`, `/api/unsubscribe` POST handlers. Writes to `subscribers` and reads `unsubscribe_token` lookups.
- **Resend** for transactional email (confirmation, unsubscribe). Free tier (3k/mo) covers v0.1.
- **Cloudflare Turnstile** on the subscribe form (free, no PII to a third party).
- **No JSON-LD `JobPosting` in v0.1.** Google for Jobs requires a `description` field; our descriptions are placeholder/empty until the descriptions-enrichment task. Shipping JSON-LD without descriptions risks structured-data warnings in Search Console. Defer to v0.2 when descriptions land.

## Routes

| Path | Render | Cache | Notes |
|---|---|---|---|
| `/` | SSR | `s-maxage=300, stale-while-revalidate=600` | Hero + 10 most recent relevant jobs + subscribe form |
| `/jobs` | SSR | `s-maxage=300, swr=600` | Paginated listing (?page=N&q=&loc=&country=) |
| `/jobs/[slug]` | SSR | `s-maxage=600, swr=3600` | Slug = first 12 hex chars of `jobs.id` (sha256), full job detail |
| `/employers/[slug]` | SSR | `s-maxage=600, swr=3600` | Per-employer job list, slug = `normalized_name` |
| `/feed.xml` | SSR | `s-maxage=900, swr=3600` | RSS 2.0, top 50 relevant jobs |
| `/feed.json` | SSR | `s-maxage=900, swr=3600` | JSON Feed 1.1 mirror of RSS |
| `/sitemap.xml` | SSR | `s-maxage=3600` | All `/jobs/[slug]` + static pages |
| `/robots.txt` | static | — | Allow all, point to sitemap |
| `/api/subscribe` | POST handler | no-cache | Turnstile verify → upsert subscriber (unconfirmed) → Resend confirmation |
| `/api/confirm` | GET handler | no-cache | `?token=` → flip `confirmed_at` |
| `/api/unsubscribe` | GET + POST | no-cache | `?token=` → delete row, GET shows confirmation page |
| `/privacy` | static | 1d | GDPR notice (data we collect, Resend processor, retention, contact) |
| `/terms` | static | 1d | Boilerplate, deep-link disclaimer for aggregator content |
| `/404`, `/500` | static / SSR | — | Branded error pages |

## RLS migration (`packages/schema/migrations/0002_rls.sql`)

```sql
ALTER TABLE wind_turbine.jobs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE wind_turbine.employers   ENABLE ROW LEVEL SECURITY;
ALTER TABLE wind_turbine.job_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE wind_turbine.subscribers ENABLE ROW LEVEL SECURITY;

CREATE POLICY public_relevant_jobs ON wind_turbine.jobs FOR SELECT TO anon
  USING (classification_score >= 0.6 OR is_sponsored = true);

CREATE POLICY public_employers ON wind_turbine.employers FOR SELECT TO anon USING (true);
CREATE POLICY public_job_sources ON wind_turbine.job_sources FOR SELECT TO anon USING (true);

-- subscribers: no anon access; only service role writes/reads
```

Service-role bypasses RLS by design — the worker ingest path keeps working unchanged.

## Multi-niche middleware (`apps/web/src/middleware.ts`)

```ts
import { defineMiddleware } from "astro:middleware";
import { nicheFromHost, getAllNiches } from "@owljobs/niches";

export const onRequest = defineMiddleware(async (ctx, next) => {
  const host = ctx.request.headers.get("host") ?? "";
  let niche;
  try { niche = nicheFromHost(host); }
  catch { niche = getAllNiches()[0]!; } // dev fallback
  ctx.locals.niche = niche;
  return next();
});
```

Every page reads `Astro.locals.niche` for branding, schema name, and the `supabasePublic.schema(niche.supabaseSchema)` call.

## Slug strategy

`jobs.id` is `sha256(sourceId)` — 64 hex chars, too long for a URL. Use the first **12 hex chars** (48 bits of entropy) as the slug. Birthday-collision math: ~16M jobs before 1% collision probability — fine for years. Lookup is `WHERE id LIKE $1 || '%' LIMIT 2`; if 2 rows return, fall back to full-id lookup (won't happen at our scale, but the guard is a 1-line check).

The full canonical URL stays available via the `canonical_url` column for the apply CTA.

## GDPR double opt-in flow

1. User submits form → `/api/subscribe` with email + Turnstile token.
2. Verify Turnstile → insert `subscribers` row with `confirmation_token = randomUUID()`, `confirmed_at = null`.
3. Resend email: "Click here to confirm: `https://owljobs.com/api/confirm?token=...`".
4. `/api/confirm` flips `confirmed_at = now()`, redirects to `/?confirmed=1`.
5. Every email (confirmation, future digest) includes `List-Unsubscribe` header + visible unsubscribe link → `/api/unsubscribe?token=...` (also `List-Unsubscribe-Post` per RFC 8058).
6. Privacy page lists Resend as a sub-processor and links to their DPA.

Schema additions needed in `packages/schema`:
```sql
ALTER TABLE wind_turbine.subscribers
  ADD COLUMN confirmation_token uuid DEFAULT gen_random_uuid(),
  ADD COLUMN unsubscribe_token uuid DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX ON wind_turbine.subscribers (confirmation_token);
CREATE UNIQUE INDEX ON wind_turbine.subscribers (unsubscribe_token);
```

## Sort order fix

Current backend listing query sorts `is_sponsored DESC, posted_at DESC`. That ignores `featured_until` — an expired sponsorship would still pin to the top. Frontend listing query must be:

```sql
ORDER BY
  (is_sponsored AND (featured_until IS NULL OR featured_until > now())) DESC,
  posted_at DESC NULLS LAST
LIMIT $1 OFFSET $2
```

Encode this once in a `listJobs(db, opts)` helper in `apps/web/src/lib/jobs.ts` so every route uses the same ordering.

## SEO surface (v0.1, pre-JSON-LD)

- `<title>` and `<meta description>` per page, niche-aware (read from `niche.name`, `niche.tagline`).
- OpenGraph + Twitter cards on `/jobs/[slug]` (auto-generated `og:image` deferred to v0.2 — for v0.1 use a static branded fallback at `/og-default.png`).
- `<link rel="canonical">` on every page.
- `sitemap.xml` lists every `/jobs/[slug]` (filter `classification_score >= 0.6 OR is_sponsored`) — drives Google discovery before Google for Jobs is wired up.
- `robots.txt` allows all + points to sitemap.
- Apply CTA on `/jobs/[slug]` is `rel="nofollow noopener"` to the canonical employer URL — keeps link equity on us, opens in new tab.

## Repo layout

```
apps/web/
  astro.config.mjs            # output: 'server', cloudflare adapter, tailwind integration
  package.json
  tailwind.config.mjs         # niche-aware tokens via CSS vars set in <html style>
  tsconfig.json               # extends ../../tsconfig.base.json
  wrangler.toml               # Pages config; secrets: SUPABASE_URL, SUPABASE_ANON_KEY,
                              # SUPABASE_SERVICE_KEY, RESEND_API_KEY, TURNSTILE_SECRET_KEY
  src/
    middleware.ts             # niche dispatch
    env.d.ts                  # extend App.Locals with niche
    lib/
      supabase.ts             # supabasePublic() + supabaseAdmin() factories
      jobs.ts                 # listJobs, getJobBySlug, listEmployerJobs
      slug.ts                 # slugFromId, idFromSlug
      resend.ts               # sendConfirmation, sendUnsubscribeAck
      turnstile.ts            # verifyTurnstile
    components/
      JobCard.astro
      JobList.astro
      SubscribeForm.astro
      Layout.astro            # niche-branded header/footer, OG tags
      SponsoredBadge.astro
    pages/
      index.astro
      jobs/index.astro
      jobs/[slug].astro
      employers/[slug].astro
      feed.xml.ts
      feed.json.ts
      sitemap.xml.ts
      privacy.astro
      terms.astro
      404.astro
      500.astro
      api/subscribe.ts
      api/confirm.ts
      api/unsubscribe.ts
    styles/global.css
  public/
    robots.txt
    og-default.png
    favicon.svg
```

## Critical files to create/modify

**Create:**
- `apps/web/**` — entire Astro app per the layout above
- `packages/schema/migrations/0002_rls.sql` — RLS policies on jobs/employers/job_sources/subscribers
- `packages/schema/migrations/0003_subscriber_tokens.sql` — confirmation_token, unsubscribe_token columns + indexes

**Modify:**
- `packages/niches/src/index.ts` — already exports `nicheFromHost`/`getAllNiches`; add a small `dbScope(niche)` helper if not present, returning the schema name
- `niches/wind-turbine.ts` — `domain: "owljobs.com"` already present; verify `branding.primaryColor`/`accentColor` are renderable as CSS vars (already present)
- Root `pnpm-workspace.yaml` — add `apps/*` to the workspaces glob
- `workers/ingest/src/index.ts` — remove `/jobs.json` debug endpoint once frontend is live (it returns service-role data without RLS — keep behind a header check or delete in v0.2)

**No changes to:**
- `workers/ingest/src/{ingest,classify}.ts` — frontend is read-only
- `packages/ats-adapters/**` — niche-agnostic
- `niches/wind-turbine.ts` config (already complete)

## Build order (one PR per step ideal)

1. **Scaffold** `apps/web/` with Astro 5 + Cloudflare adapter + Tailwind v3. Verify `wrangler pages dev` serves a placeholder. (~30 min)
2. **Apply RLS migration** + token-column migration via Supabase SQL editor or `supabase db push`. Test with `psql` using anon JWT that `SELECT * FROM jobs` returns only relevant rows. (~30 min)
3. **Supabase clients + middleware + Layout** — niche resolves, branding renders, anon client reads jobs. (~1 h)
4. **Listing pages** — `/`, `/jobs` with pagination, `/jobs/[slug]` with employer + sources. Wire the sort-order fix. (~2 h)
5. **Employer pages** — `/employers/[slug]` lists that employer's relevant jobs. (~30 min)
6. **Feeds + sitemap + robots** — RSS, JSON Feed, sitemap. (~1 h)
7. **Subscribe API** — Turnstile, Resend, double opt-in. Test full loop manually. (~2 h)
8. **Privacy + terms + 404/500.** (~30 min)
9. **Custom domain** — point `owljobs.com` at Pages, set TLS, verify multi-niche middleware on production host. (~30 min)
10. **Deploy** + smoke test the verification list below.

Total: ~9 hours of focused work.

## Verification

After deploy to `owljobs.com`:
- `curl -sI https://owljobs.com/ | head` → 200 + `Cache-Control: s-maxage=300...`
- `curl -s https://owljobs.com/jobs.json` (debug endpoint) — expect 404 once removed; until then confirm count matches `/jobs` page.
- Anon-key smoke test: `psql` with anon JWT, `SELECT count(*) FROM wind_turbine.jobs WHERE classification_score < 0.6 AND is_sponsored = false` → 0 rows visible. Same query with service role → ~700 noise jobs.
- `/jobs/[slug]` for a known job ID prefix renders title, employer, location, posted date, apply button linking to `canonical_url` with `rel="nofollow noopener"`.
- Subscribe with a real email → receive Resend confirmation within 60s → click link → `/?confirmed=1` → `subscribers.confirmed_at` populated. Click unsubscribe in the same email → row deleted.
- Submit subscribe form with a missing/invalid Turnstile token → 400.
- `/feed.xml` validates at `https://validator.w3.org/feed/`.
- `/sitemap.xml` lists ≥ 30 job URLs (the relevant ones), no noise jobs.
- `https://search.google.com/test/rich-results` on a `/jobs/[slug]` URL — confirm **no** structured-data warnings (we shipped no JSON-LD on purpose; this just verifies we didn't accidentally include broken markup).
- Lighthouse on `/` and `/jobs/[slug]`: Performance ≥ 95, Accessibility ≥ 95, SEO = 100.
- DNS: `dig owljobs.com` resolves to Cloudflare; TLS cert is valid.

## Out of scope (v0.2+)

- JSON-LD `JobPosting` (needs job descriptions enriched first)
- Auto-generated OG images per job (Cloudflare Images or Satori)
- Search/filters beyond country + free-text title (full-text search via `tsvector` is a v0.2 schema task)
- Employer self-serve / Stripe / featured-post checkout
- Weekly digest worker (subscribers exist; sending is `workers/digest` in v0.2)
- Job descriptions enrichment (re-fetch detail pages, store in `jobs.description`)
- "Similar jobs" via embedding nearest-neighbor (embeddings already stored)
- Analytics (Plausible or Cloudflare Web Analytics) — pick one before launch if desired; both privacy-safe under GDPR without consent banner
