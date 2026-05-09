# Phase 1: Production Foundation - Context

**Gathered:** 2026-05-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the site legally compliant (GDPR), get email infrastructure production-ready (Resend domain verified, consent captured), and ensure dead jobs are never served — the technical credibility floor before any employer outreach or candidate traffic.

Requirements in scope: INFRA-02, INFRA-03, INFRA-04, INFRA-05, INFRA-06, INFRA-07, INFRA-08, DATA-01, DATA-02, DATA-03

</domain>

<decisions>
## Implementation Decisions

### Stale Job Expiry (DATA-01, DATA-02, DATA-03)

- **D-01:** Detection mechanism — after each employer's ATS fetch, compare returned job IDs against DB rows for that employer. Mark absent IDs as expired. **Only run expiry logic if the fetch succeeded with ≥1 results** — skip on error or empty response to prevent mass-expiry from transient ATS downtime.
- **D-02:** Storage — soft-delete: set `expired_at = NOW()` and `status = 'expired'` on the row. Row is kept for audit trail, 410 responses, and Google Indexing API reference.
- **D-03:** Schema change — add `status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired'))` to the `jobs` table via a new migration (`0004`). All read queries filter `status = 'active'`. Migration 0004 also adds `consent_given_at TIMESTAMPTZ` to subscribers (see D-08).
- **D-04:** Expiry runs in the **same ingest cron handler** (`workers/ingest/src/index.ts` scheduled handler), after each employer ATS fetch. No separate scheduled trigger.
- **D-05:** Re-listing — if an expired job re-appears in the ATS feed (same dedup hash), **re-activate the existing row**: set `status = 'active'`, clear `expired_at`. Do not insert a duplicate row.
- **D-06:** Retention — expired rows are hard-deleted after 90 days via a cleanup step in the **same ingest cron handler** (not a separate trigger).
- **D-07:** Expired job page UX — return **HTTP 410** (not 404) with a "This job is no longer available" page that includes a link back to the job listings. 410 is the correct signal for Google to deindex permanently.

### Google Indexing API (DATA-03)

- **D-08:** Full Google Indexing API integration in Phase 1 — set up service account + `GOOGLE_INDEXING_KEY` Cloudflare Pages secret. On job expiry, ping the Indexing API with `URL_UPDATED` type and the expired job's canonical URL.
- **D-09:** Ping fires **synchronously inside the ingest worker** immediately after marking jobs expired. Failure is logged but non-fatal — next ingest run re-checks. No queue overhead.
- **D-10:** Phase 2 (SEO-03) extends this integration to creation and description update pings — the auth setup in Phase 1 makes that a small delta.

### GDPR Consent (INFRA-05, INFRA-06)

- **D-11:** Add a **required consent checkbox** to `Newsletter.astro` subscribe form. Text: _"I agree to receive wind turbine job alerts by email. I can unsubscribe at any time. [Read our Privacy Policy.](/privacy)"_ — "Privacy Policy" is a link to `/privacy`. Cannot submit without checking it.
- **D-12:** Store consent in DB — add `consent_given_at TIMESTAMPTZ` to the `subscribers` table (via migration 0004). Set on initial subscribe API call.

### GDPR Data Deletion (INFRA-08)

- **D-13:** Deletion request form **embedded at the bottom of `/privacy`** — no separate route.
- **D-14:** On submission, POST to `/api/delete-request`. Handler: verify Turnstile, then send email to `privacy@windturbinejobs.com` with the requester's email. Show inline success message: _"We received your request and will process it within 30 days."_ No confirmation email sent to the requester.
- **D-15:** Turnstile bot protection on the deletion form (reuse existing `TURNSTILE_SITE_KEY`).
- **D-16:** Deletion is processed manually by the founder (look up email in Supabase, delete the row). GDPR's 30-day response window makes manual processing acceptable for v1.

### Ops Pre-requisites (INFRA-02, INFRA-03, INFRA-04)

These are ops tasks, not code tasks — the researcher/planner should capture them as runbook steps, not code plans:

- **INFRA-02:** Apply migrations 0002 + 0003 (and new 0004) to Supabase production via the Supabase dashboard SQL editor.
- **INFRA-03:** Verify Resend sending domain (SPF/DKIM/DMARC) in the Resend dashboard before any email is sent.
- **INFRA-04:** Set all Cloudflare Pages secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`, `TURNSTILE_SITE_KEY`, `GOOGLE_INDEXING_KEY`. (6 secrets — note `PAGES_DEPLOY_HOOK` is a Worker secret, not a Pages secret.)

### Claude's Discretion

- Exact Supabase query shape for expiry detection (joining `jobs` + `job_sources` to compare external ATS IDs)
- Google Indexing API auth approach (service account JSON in env vs. individual fields)
- Privacy page layout for the deletion form — keep it inline below the existing content

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` — INFRA-02 through INFRA-08 and DATA-01 through DATA-03 (the 10 requirements this phase delivers)
- `.planning/ROADMAP.md` — Phase 1 success criteria (4 criteria to verify against)

### Database Schema & Migrations
- `packages/schema/src/migrations/0001_initial.sql` — base schema (jobs, employers, job_sources, subscribers tables)
- `packages/schema/src/migrations/0002_rls.sql` — RLS policies (must be applied before Phase 1 is live)
- `packages/schema/src/migrations/0003_subscribers_multi_niche.sql` — multi-niche subscribers schema (must be applied)
- `packages/schema/src/index.ts` — TypeScript types for Job, Employer, JobSource, Subscriber; dedup key logic (`normalizeForKey`)

### Ingest Worker (stale job detection)
- `workers/ingest/src/index.ts` — scheduled handler entry point; add expiry detection + cleanup here
- `workers/ingest/src/ingest.ts` — ATS fetch logic; expiry detection runs after each employer fetch succeeds
- `workers/ingest/wrangler.toml` — cron schedule, queue bindings; new `GOOGLE_INDEXING_KEY` secret must be added here

### Frontend (410, sitemap, consent)
- `apps/web/src/pages/jobs/[slug].astro` — job detail page; must return HTTP 410 when `status = 'expired'`
- `apps/web/src/lib/jobs.ts` — all job queries (listJobs, listFeedJobs, listSitemapJobs, getStats); must add `status = 'active'` filter
- `apps/web/src/pages/sitemap.xml.ts` — sitemap; must exclude expired jobs
- `apps/web/src/pages/feed.json.ts` — JSON feed; must exclude expired jobs
- `apps/web/src/pages/feed.xml.ts` — RSS feed; must exclude expired jobs
- `apps/web/src/components/Newsletter.astro` — subscribe form; add required consent checkbox
- `apps/web/src/pages/privacy.astro` — privacy policy page; add GDPR deletion request form at bottom
- `apps/web/src/pages/api/subscribe.ts` — subscribe API; must save `consent_given_at` on subscriber insert

### Email & Bot Protection Patterns
- `apps/web/src/lib/resend.ts` — Resend fetch wrapper (reuse pattern for any new email sends)
- `apps/web/src/lib/turnstile.ts` — Turnstile verification (reuse for deletion request form)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/web/src/lib/resend.ts` — plain `fetch` to Resend API; reuse pattern for the deletion notification email
- `apps/web/src/lib/turnstile.ts` — Turnstile verification helper; plug into `/api/delete-request` as-is
- `apps/web/src/pages/api/subscribe.ts` — pattern for Astro API routes with Turnstile + Supabase; use as template for `/api/delete-request`
- `apps/web/src/components/ui/Checkbox.astro` — Checkbox component already exists; use for consent checkbox

### Established Patterns
- **Dedup key:** SHA-256 of `normalizeForKey(employer + title + location)` used as job primary ID (see `packages/schema/src/index.ts`). The `job_sources` table tracks the ATS's own external job ID per feed — use `job_sources.external_id` for expiry comparison, not the internal UUID.
- **`Promise.allSettled` in ingest** — per-employer failures are counted in stats but don't halt other employers. Expiry detection must follow the same pattern.
- **Queue chaining** — classify → enrich chains via Cloudflare Queues. Do NOT add Google Indexing API calls to the queue chain; run them synchronously in the ingest handler after expiry marking.
- **Classification filter** — all read queries use `classification_score >= 0.5`; expiry queries add `status = 'active'` on top of this, not instead of it.
- **Privacy page is prerendered** (`export const prerender = true`) — the deletion request form must be a client-side fetch to an API route (not a server-side form action) to stay compatible.

### Integration Points
- Expiry detection → Google Indexing API ping (synchronous, in ingest worker)
- Expiry detection → `status = 'expired'` filter on all frontend job queries
- `consent_given_at` → set in `/api/subscribe` handler when subscriber row is created
- Migration 0004 → adds `status` to jobs + `consent_given_at` to subscribers (one migration, two changes)

</code_context>

<specifics>
## Specific Ideas

- The 410 page should be minimal: a heading ("This job is no longer available"), a one-line explanation, and a "Browse open roles →" link back to `/`. No need for a custom error component — reuse the existing 404 pattern from `apps/web/src/pages/404.astro`.
- Privacy policy deletion form wording: "Request data deletion" as the section heading, a short explanation (1–2 sentences referencing GDPR Article 17), email field, Turnstile widget, submit button, inline success/error messages matching the subscribe form style.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-Production Foundation*
*Context gathered: 2026-05-09*
