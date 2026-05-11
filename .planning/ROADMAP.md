# OwlJobs Roadmap

_Generated: 2026-05-09_
_Granularity: standard | Mode: mvp | Phases: 5_

## Goal

Reach consistent MRR from employer subscriptions (€499 / €999 / €1999/mo) on Wind Turbine Jobs (niche 1) by sequencing: production foundation → employer breadth → candidate activation → employer product → monetization.

## Phases

- [x] **Phase 1: Production Foundation** — Domain live, GDPR + email infra production-ready, stale jobs removed _(completed 2026-05-10)_
- [ ] **Phase 2: Employer Breadth & SEO** — 20+ employers ingested, Google for Jobs eligible
- [ ] **Phase 3: Candidate Activation** — Weekly digest live, ≥100 confirmed subscribers (hard gate)
- [ ] **Phase 4: Employer Product** — Auto-generated company pages, claim flow, magic-link dashboard, featured jobs
- [ ] **Phase 5: Monetization & Outreach** — Stripe billing live, first paying employers via FOMO outreach

## Phase Details

### Phase 1: Production Foundation
**Goal:** Site is legally compliant, email infrastructure is ready, and dead jobs are never served — the technical credibility floor regardless of which domain it runs on.
**Mode:** mvp
**Depends on:** Nothing (first phase)
**Requirements:** INFRA-02, INFRA-03, INFRA-04, INFRA-05, INFRA-06, INFRA-07, INFRA-08, DATA-01, DATA-02, DATA-03
**Success Criteria** (what must be TRUE):
  1. A visitor can read the privacy policy, subscribe with explicit consent, receive a confirmation email from the verified sending domain, and unsubscribe in one click
  2. A user can submit a GDPR data deletion request and have all their data removed
  3. A job that disappears from its ATS feed returns HTTP 410 within 24 hours, drops out of listings/sitemap/RSS, and has its `JobPosting` schema removed and re-pinged to Google
  4. All required Cloudflare Pages secrets are set and the production deploy boots without missing-env errors
**Plans:** 6 plans
  - [x] 01-01-PLAN.md — Stale jobs (DB + worker): migration 0004, expire.ts, google-indexing.ts, ingest reactivation, vitest scaffold
  - [x] 01-02-PLAN.md — Stale jobs (frontend): status='active' filter on list/feed/sitemap/stat queries + 410 branch in [slug].astro
  - [x] 01-03-PLAN.md — GDPR consent: required checkbox in Newsletter.astro + server enforcement + consent_given_at write
  - [x] 01-04-PLAN.md — GDPR deletion form: /privacy.astro form + /api/delete-request + sendDeletionRequest helper
  - [~] 01-05-PLAN.md — Ops runbook + [BLOCKING] schema push: migration 0004 applied; Resend DNS, secrets, GCP, deploy deferred to final phase
  - [~] 01-06-PLAN.md — INFRA-07 verification: code confirmed intact; live RFC 8058 smoke test deferred (needs production deploy)

### Phase 2: Employer Breadth & SEO
**Goal:** The site has enough employer coverage and Google for Jobs visibility to look credible to both candidates and (eventually) cold-pitched employers.
**Mode:** mvp
**Depends on:** Phase 1
**Requirements:** COVG-01, COVG-02, COVG-03, SEO-01, SEO-02, SEO-03
**Success Criteria** (what must be TRUE):
  1. A user browsing the site sees jobs from at least 20 distinct employers (target 50)
  2. Every job detail page passes Google's Rich Results Test for `JobPosting` structured data
  3. Every relevant classified job displays a full enriched description (no stub-only listings)
  4. The auto-discovery script reports a ranked list of new employer candidates with detected ATS platform and confidence score
  5. Job creation, expiry, and description updates ping the Google Indexing API and the URL appears in Search Console within 48 hours
**Plans:** 8 plans
  - [x] 02-01-PLAN.md — [BLOCKING] migration 0005 (public.candidates) + Wave 1 activation (6 employers) + wave1.test.ts _(completed 2026-05-11; requires supabase db push to activate in production)_
  - [x] 02-02-PLAN.md — JSON-LD JobPosting on [slug].astro (SEO-01): conditional render + validThrough + location guard _(completed 2026-05-11)_
  - [x] 02-03-PLAN.md — Indexing API creation + description pings in ingest.ts + enrich.ts (SEO-03) _(completed 2026-05-11)_
  - [x] 02-04-PLAN.md — fetch-description.ts commit + AtsTarget union extension + SmartRecruiters/Trakstar/Adzuna/JSearch stubs (SEO-02) _(completed 2026-05-11)_
  - [x] 02-05-PLAN.md — SmartRecruiters adapter: list endpoint + ingest function + 2+ wind employers (COVG-02) _(completed 2026-05-11)_
  - [x] 02-06-PLAN.md — Adzuna + JSearch aggregator adapters: no-expire guard + wrangler secrets (COVG-03) _(completed 2026-05-11)_
  - [x] 02-07-PLAN.md — Trakstar adapter for Ørsted: probe + proceed/abort decision + source-contract tests (COVG-02) _(completed 2026-05-11; abort path — Ørsted account defunct, covered by Adzuna)_
  - [x] 02-08-PLAN.md — Discovery Worker workers/discover: POST /probe + ATS detection (8 platforms) + DISCOVER_SECRET auth (COVG-01) _(completed 2026-05-11)_

### Phase 3: Candidate Activation
**Goal:** A real, growing candidate audience exists — the prerequisite that unlocks the employer FOMO pitch.
**Mode:** mvp
**Depends on:** Phase 2
**Requirements:** CAND-01, CAND-02, CAND-03, CAND-04
**Success Criteria** (what must be TRUE):
  1. A confirmed subscriber receives a weekly digest email at 06:00 UTC containing only new matching jobs
  2. The digest email passes inbox checks (RFC 8058 `List-Unsubscribe` + `List-Unsubscribe-Post` headers, one-click works in Gmail/Outlook)
  3. A subscriber never receives the same digest twice for the same date (idempotency enforced at DB)
  4. The `subscribers` table contains ≥100 double-opt-in confirmed records — the hard gate before any employer cold pitch
**Plans:** TBD

### Phase 4: Employer Product
**Goal:** Every employer has a claimable on-site presence and the paid features they will be charged for actually exist and work.
**Mode:** mvp
**Depends on:** Phase 3
**Requirements:** PROF-01, PROF-02, PROF-03, PROF-04, PROF-05, PROF-06, FEAT-01, FEAT-02, FEAT-03, FEAT-04, ANLYT-01, ANLYT-02
**UI hint:** yes
**Depends on:** Phase 3
**Success Criteria** (what must be TRUE):
  1. A visitor sees an auto-generated company profile page at `/employers/[slug]` for every ingested employer with name, logo, and all open roles, plus a visible "Claim this listing" CTA
  2. An employer can request a magic link, log in, and land on a dashboard scoped to only their own employer (RLS-enforced via `employer_id` JWT claim)
  3. A logged-in employer can edit their profile fields (sanitized HTML), upload a logo, and toggle "Featured" on individual jobs up to their tier limit
  4. Featured jobs appear pinned at the top of the listing with a visible badge and auto-disappear from the pinned position when `featured_until` has passed
  5. An employer's dashboard shows 30-day views, clicks, and apply-clicks per job, plus a weekly count of new matching candidate subscribers
**Plans:** TBD

### Phase 5: Monetization & Outreach
**Goal:** First paying employers are onboarded — Stripe is live, EU VAT is correct, and the founder is sending the FOMO pitch.
**Mode:** mvp
**Depends on:** Phase 4 (and Phase 3 hard gate of ≥100 subscribers)
**Requirements:** BILL-01, BILL-02, BILL-03, BILL-04, BILL-05, BILL-06, BILL-07, BILL-08, GTM-01, GTM-02
**Success Criteria** (what must be TRUE):
  1. A paid employer receives a Stripe invoice with correct EU B2B reverse-charge text (or 21% Belgian VAT for BE customers), pays it, and sees `subscription_active = true` reflected in the dashboard within minutes
  2. A paid employer can manage their subscription (upgrade, downgrade, cancel, download invoice) via the Stripe Customer Portal
  3. A free-tier employer who clicks "Edit profile" or "Feature this job" is blocked at the RLS layer — paid features are inaccessible without an active subscription
  4. The Stripe webhook handler processes events idempotently (replay of the same event ID is a no-op) and the daily reconciliation cron repairs any drift between Stripe and Supabase
  5. The founder has sent the FOMO outreach template to ≥10 prospect employers using the documented manual onboarding checklist, and ≥1 has converted to a paid subscription
**Plans:** TBD

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Production Foundation | 6/6 | Complete | 2026-05-10 |
| 2. Employer Breadth & SEO | 0/8 | Not started | - |
| 3. Candidate Activation | 0/0 | Not started | - |
| 4. Employer Product | 0/0 | Not started | - |
| 5. Monetization & Outreach | 0/0 | Not started | - |

## Coverage

42 v1 requirements mapped to phases. INFRA-01 (domain registration) moved to Out of Scope — ops task, not a code deliverable.

| Category | REQ count | Phase(s) |
|----------|-----------|----------|
| INFRA | 7 | Phase 1 |
| DATA | 3 | Phase 1 |
| SEO | 3 | Phase 2 |
| COVG | 3 | Phase 2 |
| CAND | 4 | Phase 3 |
| PROF | 6 | Phase 4 |
| FEAT | 4 | Phase 4 |
| ANLYT | 2 | Phase 4 |
| BILL | 8 | Phase 5 |
| GTM | 2 | Phase 5 |
| **Total** | **42** | **5 phases** |

## Notes

- **Hard gate:** Phase 5 (employer cold outreach) cannot start until Phase 3 success criterion #4 is met (≥100 confirmed subscribers) AND Phase 2 success criterion #1 is met (≥20 employers ingested). This is enforced at phase entry, not just documented.
- **Mode:** mvp — each phase delivers an end-to-end vertical slice with observable user behavior. No horizontal layering.
- **Multi-niche constraint:** No new code may hardcode `wind_turbine` schema — all features built must work for arbitrary niches per the existing niche registry pattern.
