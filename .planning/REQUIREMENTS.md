# Requirements — OwlJobs v1 (Wind Turbine Jobs)

_Generated: 2026-05-09_

## v1 Requirements

### Infrastructure & Compliance (INFRA)

- [ ] **INFRA-01**: Domain (`windturbinejobs.com` or chosen domain) registered and pointing to Cloudflare Pages
- [ ] **INFRA-02**: Supabase migrations 0002+0003 applied (RLS policies + multi-niche subscribers schema)
- [ ] **INFRA-03**: Resend sending domain verified — SPF, DKIM, DMARC aligned before first email send
- [ ] **INFRA-04**: All 6 Cloudflare Pages secrets configured via `wrangler pages secret put`
- [ ] **INFRA-05**: GDPR privacy policy page published listing exact data flows (Supabase, Cloudflare, Resend, Stripe)
- [ ] **INFRA-06**: Granular consent checkbox at newsletter subscribe (job alerts consent ≠ marketing consent)
- [ ] **INFRA-07**: One-click unsubscribe flow working end-to-end
- [ ] **INFRA-08**: Data deletion request flow (GDPR Article 17 — user can request all their data removed)

### Data Quality (DATA)

- [ ] **DATA-01**: Stale job detection — re-poll ATS feeds daily, flag jobs no longer present as expired
- [ ] **DATA-02**: Expired jobs return HTTP 410 and are removed from sitemap, RSS feed, and listing queries
- [ ] **DATA-03**: `JobPosting` JSON-LD schema removed from expired job pages and removal pinged to Google Indexing API

### Search & SEO (SEO)

- [ ] **SEO-01**: JSON-LD `JobPosting` structured data on all job detail pages (all required fields validated in Rich Results Test)
- [ ] **SEO-02**: Description enrichment fully operational — `fetch-description.ts` shipping enriched descriptions for all relevant classified jobs
- [ ] **SEO-03**: Google Indexing API ping on job creation, expiry, and description update

### Employer Breadth (COVG)

- [ ] **COVG-01**: ATS auto-discovery script — probes employer longlist URLs for ATS platform signatures (Workday, Greenhouse, Lever, Ashby, Recruitee, SuccessFactors, Softgarden, SmartRecruiters)
- [ ] **COVG-02**: Employer coverage expanded from 3 to minimum 20 employers ingested (target: 50)
- [ ] **COVG-03**: Aggregator fallback (Adzuna) configured to fill coverage gaps for employers without native ATS adapters

### Candidate Activation (CAND)

- [ ] **CAND-01**: Weekly email digest worker — Cron trigger (06:00 UTC) → fan-out to queue → Resend delivery of new matching jobs to confirmed subscribers
- [ ] **CAND-02**: Email digest includes `List-Unsubscribe` and `List-Unsubscribe-Post` headers
- [ ] **CAND-03**: Email digest idempotency — unique constraint on `(subscriber_id, sent_date, type)` prevents duplicate sends
- [ ] **CAND-04**: Minimum 100 confirmed (double-opt-in) subscribers acquired via active outreach — **hard gate before any employer cold pitch**

### Company Profile Pages (PROF)

- [ ] **PROF-01**: Auto-generated company profile pages — one page per employer with name, logo (via logo.dev), all open roles
- [ ] **PROF-02**: "Claim this listing" CTA on all auto-generated company pages
- [ ] **PROF-03**: Magic-link employer login via Supabase Auth + `@supabase/ssr` ^0.10.0
- [ ] **PROF-04**: Employer dashboard — view claimed company page, manage featured jobs, view performance metrics
- [ ] **PROF-05**: Editable company profile — rich description (HTML-sanitized), benefits list, structured fields — unlocked at paid tier
- [ ] **PROF-06**: Logo upload to Supabase Storage (replacing auto-fetched logo for paying employers)

### Featured Placement (FEAT)

- [ ] **FEAT-01**: `featured_until TIMESTAMPTZ` column on jobs with self-expiring sort (`ORDER BY (featured_until > NOW()) DESC NULLS LAST`)
- [ ] **FEAT-02**: Featured jobs appear pinned at top of listing with visual "Featured" badge and highlighted card treatment
- [ ] **FEAT-03**: Employer can toggle featured status on individual jobs from dashboard (up to tier slot limit, enforced application-side)
- [ ] **FEAT-04**: Featured employers shown in homepage carousel section (Tier 2+, limited to 3–6 slots for scarcity)

### Employer Alerts & Analytics (ANLYT)

- [ ] **ANLYT-01**: Performance dashboard — 30-day views, clicks, and apply-link clicks per job (the renewal hinge)
- [ ] **ANLYT-02**: Weekly candidate match alert email to paying employers — count of new confirmed subscribers matching their niche/region

### Subscription Billing (BILL)

- [ ] **BILL-01**: `workers/billing` — Stripe webhook handler using `constructEventAsync` + WebCrypto, `stripe_events` idempotency table (PK on Stripe event ID), receive-fast-enqueue-process pattern
- [ ] **BILL-02**: `employer_subscriptions` table in public schema + denormalized `tier` / `subscription_active` columns on `employers` for fast RLS reads
- [ ] **BILL-03**: 3-tier subscription products configured in Stripe (Starter €499/mo, Growth €999/mo, Partner €1999/mo)
- [ ] **BILL-04**: Stripe Tax enabled with VIES validation + EU B2B reverse charge (invoice text: "Reverse charge — VAT to be accounted for by the recipient")
- [ ] **BILL-05**: Stripe Customer Portal enabled (upgrade, downgrade, cancel, invoice download)
- [ ] **BILL-06**: Manual Stripe invoice flow for first 5 customers (no self-serve checkout in v1)
- [ ] **BILL-07**: RLS gates all paid employer features by `subscription_active = true AND tier IN (...)` — free-tier employers can claim but cannot edit profile or feature jobs
- [ ] **BILL-08**: Daily reconciliation cron — `stripe.subscriptions.list({ status: 'all' })` repairs any webhook-drift subscription state

### Go-to-Market (GTM)

- [ ] **GTM-01**: Cold outreach email template — FOMO pitch using seeded competitor jobs ("company X has N open roles here, here's what featured placement gets you")
- [ ] **GTM-02**: Manual employer onboarding checklist — steps founder takes to set up first paying customers (claim verification, invoice, dashboard access)

---

## v2 Requirements (Deferred)

These were considered and explicitly deferred until v1 MRR is established:

- Direct apply flow — requires building a full applicant tracking system; deferred
- Self-serve Stripe Checkout — manual invoicing for first 5 customers; self-serve deferred
- Candidate accounts and profiles — email-only in v1; accounts add auth complexity without revenue upside
- Multi-language support — English-only job listings globally; localization deferred
- Niche 2 launch — wind turbine must reach consistent MRR first; architecture is multi-niche-ready
- Talent pool database — GDPR burden without clear monetization path in v1; deferred
- Real-time push notifications — weekly digest is sufficient frequency for v1
- Multi-user employer accounts — single magic-link per employer is sufficient for v1

---

## Out of Scope

- **Direct apply** — too complex; adds ATS/inbox responsibilities; apply links route to employer ATS
- **Self-serve employer sign-up** — first customers onboarded manually; self-serve after validation
- **Candidate accounts** — subscribe-by-email only; no login, no saved jobs, no CV upload
- **Multi-language** — English only; wind industry job postings are predominantly English globally
- **Niche 2 in v1** — wind-turbine is the proof-of-concept; multi-niche architecture is in place but not activated
- **Talent pool / candidate database** — GDPR cost high, monetization unclear; v1 candidate alerts via email is sufficient
- **Workday as a paid partner target** — Workday EUA prohibits scraping; high-value Workday employers to be converted to partnership conversation, not cold-pitched at this time

---

## Traceability

_Filled by roadmapper agent._

| REQ-ID | Phase |
|--------|-------|
| INFRA-01–08 | Phase 1 |
| DATA-01–03 | Phase 1 |
| SEO-01–03 | Phase 1–2 |
| COVG-01–03 | Phase 2 |
| CAND-01–04 | Phase 3 |
| PROF-01–06 | Phase 4 |
| FEAT-01–04 | Phase 4 |
| ANLYT-01–02 | Phase 4 |
| BILL-01–08 | Phase 5 |
| GTM-01–02 | Phase 5 |
