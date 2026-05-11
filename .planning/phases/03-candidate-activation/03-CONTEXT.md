# Phase 3: Candidate Activation - Context

**Gathered:** 2026-05-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the weekly email digest worker + subscriber acquisition infrastructure that creates a real, growing candidate audience — the prerequisite that unlocks the employer FOMO pitch. Phase delivers:
- A new `workers/digest/` Cloudflare Worker (Cron Mon 06:00 UTC → Queue → Resend)
- DB migration upgrading `email_sends` for idempotency
- New POST `/api/unsubscribe-oneclick` endpoint (RFC 8058 compliance)
- Social proof copy addition to the subscribe form
- 100 confirmed (double-opt-in) subscribers — hard gate before employer cold pitch

**Out of scope for Phase 3:**
- Admin dashboard / subscriber count endpoint (manual Supabase query is sufficient)
- Welcome email after confirmation
- Manage-preferences page
- Digest frequency tuning (weekly is locked for Phase 3; revisit after engagement data)

</domain>

<decisions>
## Implementation Decisions

### Job Matching Logic
- **D-01:** "New" = jobs with `posted_at` in the prior 7-day window (relative to cron run time). All confirmed subscribers get the same weekly batch.
- **D-02:** Matching = if `subscribers.locations` is NULL → send all jobs in the niche. If set → case-insensitive substring match: include jobs where `job.location` contains any location string from the array.
- **D-03:** Zero-new-jobs week = send a "no new listings this week" email anyway. Don't skip the send — keeps the weekly cadence reliable for subscribers.
- **D-04:** Cron schedule = `0 6 * * 1` (Monday 06:00 UTC). Weekly frequency locked for Phase 3.

### Email Template
- **D-05:** Format = simple HTML (React Email compatible via Resend). Branded header, job cards, plain-text multipart fallback.
- **D-06:** Job cap = all jobs from the 7-day window, maximum 20 per digest. With niche job volume most weeks will be well under 20.
- **D-07:** Job card fields = title, company, location, apply link. No salary (often null) or posted date in the card.
- **D-08:** Subject line = dynamic with job count. Examples: `"8 new wind turbine jobs this week"` / `"Wind Turbine Jobs — no new listings this week"`.
- **D-09:** Sender = `Wind Turbine Jobs <digest@windturbinejobs.com>`. Distinct from the confirmation email sender. Resend sending domain must include this address.
- **D-10:** Footer = unsubscribe link + short brand tagline only: `"You're receiving this because you subscribed at windturbinejobs.com. Unsubscribe | © 2026 Wind Turbine Jobs."` No manage-preferences link in Phase 3.

### Subscriber Acquisition (CAND-04)
- **D-11:** Outreach channels = LinkedIn wind tech communities + direct outreach to individual wind turbine candidate profiles + SEO organic traffic from existing job listings.
- **D-12:** Subscribe form social proof = add static text, e.g. `"420+ jobs from 20+ employers"`. Updated manually after major ingests. No dynamic DB query.
- **D-13:** Subscriber count tracking = manual Supabase query (`SELECT COUNT(*) FROM wind_turbine.subscribers WHERE confirmed_at IS NOT NULL`). Update STATE.md when 100-subscriber milestone is hit. No admin UI needed.

### Digest Worker Architecture
- **D-14:** New standalone `workers/digest/` — separate codebase from `workers/ingest/`. Same structure pattern as `workers/discover/` (wrangler.toml + src/index.ts).
- **D-15:** Queue fan-out pattern: cron handler enqueues one message per 10 subscribers (batch), consumer sends 10 Resend calls per message. `max_batch_size: 10` on the queue consumer. Queue name: `owljobs-digest`.
- **D-16:** `email_sends` DB migration: add `sent_date DATE NOT NULL DEFAULT CURRENT_DATE` column + `type TEXT NOT NULL DEFAULT 'digest'` column + `UNIQUE(subscriber_id, sent_date, type)` constraint. This satisfies CAND-03 idempotency.
- **D-17:** Error handling = log error + skip failed subscriber, continue processing remaining batch. Only throw (fail the queue message) for unrecoverable errors (DB down, Resend API returning 5xx on all calls).
- **D-18:** Multi-niche from day one — use `getAllNiches()` from `@owljobs/niches`. Worker iterates all registered niches. No `wind_turbine` hardcoding.

### RFC 8058 One-Click Unsubscribe
- **D-19:** New endpoint `POST /api/unsubscribe-oneclick` — separate from existing `GET /api/unsubscribe`. Accepts `unsubscribe_token` in the POST body (form-encoded per RFC 8058: `List-Unsubscribe=One-Click`). Digest email `List-Unsubscribe-Post` header points to this endpoint.
- **D-20:** One-click unsubscribe action = set `confirmed_at = NULL` on the subscriber row (soft unsubscribe). Row preserved so re-subscribe works cleanly and `email_sends` FK references remain intact.

### Claude's Discretion
- Exact React Email component structure for the digest template
- HTML/CSS styling within the simple HTML constraint (follows existing confirmation email's style conventions)
- Exact error log format in the digest worker
- Queue retry/deadletter configuration in wrangler.toml

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` §Candidate Activation (CAND) — CAND-01 through CAND-04 definitions
- `.planning/ROADMAP.md` §Phase 3 — goal, success criteria, dependencies on Phase 2

### Database Schema & Migrations
- `packages/schema/src/migrations/0001_initial.sql` — `wind_turbine.subscribers` and `wind_turbine.email_sends` table definitions
- `packages/schema/src/migrations/0002_rls.sql` — RLS on subscribers (service_role only)
- `packages/schema/src/migrations/0003_subscribers_multi_niche.sql` — niche column, confirmation_token, unsubscribe_token uniqueness
- `packages/schema/src/migrations/0004_stale_jobs_consent.sql` — `consent_given_at` column

### Existing Worker Patterns (copy these)
- `workers/ingest/src/index.ts` — cron handler + queue producer + queue consumer pattern
- `workers/ingest/wrangler.toml` — queue producer/consumer wrangler config pattern
- `workers/discover/` — standalone worker directory structure to replicate for `workers/digest/`

### Email (Resend)
- `apps/web/src/lib/resend.ts` — Resend client initialization pattern and `sendConfirmation()` function to reference for digest sender
- `apps/web/src/pages/api/subscribe.ts` — subscribe flow (for context on subscribers table usage)
- `apps/web/src/pages/api/confirm.ts` — confirm flow (for context on `confirmed_at` update)
- `apps/web/src/pages/api/unsubscribe.ts` — existing GET unsubscribe endpoint (context for new POST one-click endpoint)

### Niche Registry
- `packages/niches/` — `getAllNiches()`, `nicheFromHost()`, `registerNiche()` — MUST use for multi-niche iteration

### Project Rules
- `CLAUDE.md` — hard rules: edge-only Workers, multi-niche always, `constructEventAsync` (Stripe), Cron→Queue(max_batch_size: 2)→Resend pattern, `@supabase/ssr` version constraint

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/web/src/lib/resend.ts` — Resend client + `sendConfirmation()` — copy pattern for `sendDigest()`
- `workers/ingest/src/index.ts` — cron + queue producer + queue consumer in one file — replicate structure in `workers/digest/src/index.ts`
- `wind_turbine.subscribers.locations` (JSONB) — already stores location preferences; location matching uses these values
- `wind_turbine.email_sends` — already exists, needs migration to add `sent_date` + `type` columns + unique constraint

### Established Patterns
- Cron → Queue fan-out → consumer: the anti-pattern (loop-and-send in cron) is documented in CLAUDE.md; queue fan-out is the mandated approach
- `getAllNiches()` iteration: used by ingest worker; digest worker must follow the same pattern
- Supabase `service_role` key for subscriber reads (RLS bypassed for workers)
- `@supabase/ssr ^0.10.0` for web, direct Supabase client for workers

### Integration Points
- New `workers/digest/` → `wind_turbine.subscribers` (read confirmed subscribers) + `wind_turbine.jobs` (read recent jobs) + `wind_turbine.email_sends` (write send record + idempotency check)
- New `POST /api/unsubscribe-oneclick` (Astro API route) → `wind_turbine.subscribers` (set `confirmed_at = NULL`)
- Subscribe form update → `apps/web/src/` (find the subscribe form component, add static social proof text)
- New `owljobs-digest` Cloudflare Queue — must be created with `wrangler queues create owljobs-digest` before first deploy

</code_context>

<specifics>
## Specific Ideas

- **Queue name:** `owljobs-digest` (consistent with `owljobs-classify`, `owljobs-enrich` naming convention)
- **Sender address:** `digest@windturbinejobs.com` — must be added to the Resend sending domain before deploy
- **Cron expression:** `0 6 * * 1` (Monday 06:00 UTC)
- **Subject examples:** `"8 new wind turbine jobs this week"` / `"Wind Turbine Jobs — no new listings this week"`
- **Footer copy:** `"You're receiving this because you subscribed at windturbinejobs.com. [Unsubscribe] | © 2026 Wind Turbine Jobs."`
- **Social proof text on subscribe form:** `"420+ jobs from 20+ employers"` (static, updated manually)
- **Migration number:** next in sequence is `0006_email_sends_idempotency.sql`

</specifics>

<deferred>
## Deferred Ideas

- **Digest frequency tuning** (daily, 3x/week) — revisit in Phase 4/5 after engagement data; weekly locked for Phase 3
- **Admin subscriber count endpoint** — manual Supabase query is sufficient for Phase 3; consider a simple `/admin/stats` page in Phase 4
- **Welcome email after confirmation** — omitted for Phase 3; consider adding in Phase 4 if early engagement is low
- **Manage preferences page** — linked from footer; Phase 4 or 5; would allow location preference updates
- **UTM tracking on digest links** — useful for conversion attribution; Phase 4

</deferred>

---

*Phase: 3-candidate-activation*
*Context gathered: 2026-05-11*
