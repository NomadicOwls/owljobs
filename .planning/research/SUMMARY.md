# Research Synthesis — OwlJobs Monetization Layer

**Project:** OwlJobs / Wind Turbine Jobs (niche 1)
**Synthesized:** 2026-05-09
**Pricing target:** EUR 499 / 999 / 1999 per month
**Sources:** STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md, PROJECT.md
**Overall confidence:** HIGH on path-to-revenue technical decisions; MEDIUM on pricing/positioning specifics

---

## Executive Summary

The existing edge stack (Cloudflare Workers + Queues + Cron, Supabase Postgres + RLS, Astro SSR on Pages, Resend) already contains every primitive needed for monetization. **No new core infrastructure is required** — only two new Workers (`workers/billing` for Stripe, `workers/discover` for ATS auto-discovery), a handful of new Supabase tables, and authenticated `/employer/*` routes inside the existing Astro app. The dominant risk is sequencing, not architecture: charging before audience exists is the documented #1 way niche job boards die.

The product OwlJobs sells is **FOMO + audience access**, not job posts. Free-tier ATS-ingested listings are the bait; the paid tier sells the right to outdisplay competitors, control the company narrative on-site, and reach the candidate audience directly. Industry standard 3-tier ladder (Starter / Growth-decoy / Featured Partner) is confirmed across Dice, RemoteOK, WeWorkRemotely; OwlJobs should follow it with Growth as the conversion target.

The critical path to first revenue: **stale-job removal + GDPR + email auth (Phase 1) → employer breadth via ATS auto-discovery (Phase 2) → weekly candidate digest (Phase 3) → auto-generated company profiles + claim flow + magic-link dashboard + featured toggle (Phase 4) → manual Stripe invoice + customer portal (Phase 5)**.

---

## Stack Recommendations

### Stripe (Billing)

| Component | Choice | Version | Why |
|---|---|---|---|
| SDK | `stripe` (npm, official) | ^18.0.0 | Officially supported in Workers since 2024 |
| Checkout | Stripe Checkout (hosted) | API 2025-08-27 | No PCI scope, EU SCA-compliant, SEPA + cards |
| Subscription mgmt UI | Stripe Customer Portal (hosted) | same | Saves weeks of UI work |
| Tax | Stripe Tax | same | Auto VAT + VIES validation + B2B reverse charge |

**Hard requirement:** Use `constructEventAsync` with `Stripe.createSubtleCryptoProvider()` for webhook verification — sync `constructEvent` does not work in Workers. Read raw body with `request.text()` BEFORE any JSON parse.

### Auth

| Component | Choice | Version | Why |
|---|---|---|---|
| Identity | Supabase Auth | bundled | Native RLS via `auth.jwt()`; €0 |
| SSR session | `@supabase/ssr` | ^0.10.0 | v0.10+ sets correct `Cache-Control` — critical footgun fixed |
| Login method | Magic link only | — | No password reset flows to build |
| Multi-tenancy | `employer_id` JWT claim via Supabase Hook | — | Fast RLS without joins |

### Email Digest

| Component | Choice | Why |
|---|---|---|
| Scheduler | Cloudflare Cron `0 6 * * *` UTC | Native, free, morning EU inbox |
| Fan-out | Cloudflare Queues `max_batch_size: 2` | Honors Resend 2 req/sec limit |
| Idempotency | Postgres unique `(subscriber_id, sent_date, type)` | No Redis needed |

**Critical pattern:** Cron → enqueue per-subscriber → consumer renders + sends. Never loop and send inside the cron handler — 30s CPU cap kills it past ~500 subscribers.

---

## Table Stakes Features

Without these, the pitch fails:

1. Job listings with apply-link routing to employer ATS (exists)
2. Search + filter — GWO cert, onshore/offshore, OEM platform
3. Auto-generated company profile pages — "Claim this listing" CTA needs somewhere to land
4. Logo on all company profiles (free: logo.dev; paid: uploaded)
5. Job-alert email subscription with double opt-in
6. **JSON-LD `JobPosting` structured data** on all detail pages (Google for Jobs)
7. GDPR compliance — consent, unsubscribe, deletion
8. **Stale job removal** — re-poll daily, 410 + remove schema (Google manual action risk if ignored)
9. Branded sender + SPF/DKIM/DMARC aligned (launch-blocking for email alerts)
10. RSS/Atom feed (exists)

---

## Differentiating Features (€499–€1999/mo justification)

Industry data: sponsored jobs get 3.1× impressions and 3.2× more applicants. "Featured" must bundle ≥3 mechanisms to feel worth paying.

### Tier 1 — Starter (€499/mo)
- Up to 3 pinned/featured roles (top of results)
- Highlighted card + "Featured Employer" badge
- Logo + tagline on listing card
- Priority placement in candidate email digest
- Performance dashboard: 30-day views, clicks, apply-clicks per job *(the renewal hinge)*

### Tier 2 — Growth (€999/mo, decoy/conversion target)
Everything in Starter plus:
- Up to 10 featured roles
- Fully editable rich company profile (hero, About, benefits, gallery, video, testimonials)
- Featured slot in homepage "Featured Employers" carousel (limited 3–6 slots = scarcity)
- Weekly candidate match alert ("5 new GWO-certified candidates joined this week")
- Quarterly market snapshot (founder-curated)

### Tier 3 — Featured Partner (€1999/mo)
Everything in Growth plus:
- Unlimited featured roles
- Dedicated section in candidate digests
- Sponsored newsletter slot (once/quarter)
- Monthly hiring report (PDF)
- Direct founder channel

### Anti-features (do NOT build for v1)
Direct apply, candidate accounts, self-serve Stripe checkout, pay-per-post pricing, talent pool DB, real-time push notifications, multilingual UI.

---

## Architecture Decisions

Four choices that constrain all implementation:

### 1. Stripe is source of truth; Supabase is read-side cache
`employer_subscriptions` in public schema (billing is global, not per-niche) + denormalized `tier` / `subscription_active` on `employers` for fast RLS. Daily reconciliation cron repairs webhook drift.

### 2. Three Workers, isolated by security context
- `workers/ingest` (existing) — ATS + classify/enrich + digest consumer
- `workers/billing` (new) — Stripe webhook secret + service-role key; smaller blast radius
- `workers/discover` (new or local CLI) — ATS auto-discovery; separate execution budget

### 3. Webhook idempotency at the database
`stripe_events` table with `id` as PK. Handler: verify → `INSERT ... ON CONFLICT DO NOTHING` → enqueue → return 200 in <100ms. Consumer does the heavy work. Same pattern as existing classify/enrich pipeline.

### 4. `featured_until TIMESTAMPTZ` self-expiring sort
Single nullable timestamp on `jobs`. `ORDER BY (featured_until > NOW()) DESC NULLS LAST, posted_at DESC`. Auto-expires with subscription cancel. Tier limits enforced application-side, not as DB CHECK.

**Plus:**
- Company profile in `profile_jsonb` (JSONB; fields evolve fast)
- `PAGES_DEPLOY_HOOK` rebuild on profile edit (SSR + CDN cache makes edits invisible otherwise)
- **HTML sanitization via `dompurify` (Workers no-DOM mode)** — security boundary on employer-editable content; `sanitize-html` is Node-only

---

## Critical Warnings

### 1. Do not pitch employers before ≥100 confirmed subscribers + ≥20 employers ingested
Hard gate. Burning the cold-pitch goodwill of the 20 employers worth pitching in the wind niche is unrecoverable for 6+ months. Without a real audience number the FOMO pitch gets one reply: "this is nothing."

### 2. Stale jobs trigger Google manual action — loses Google for Jobs for the whole domain
Stale `JobPosting` schema with past roles → Google detects dead content → suppresses all job-rich results. Fix must be atomic 4-step: DB flag + 410 response + remove `JobPosting` schema + submit to Google Indexing API.

### 3. Stripe webhook race conditions cause subscription state drift
Receive-fast-process-async pattern is mandatory. `stripe_events` idempotency table. Never trust event arrival order — use `event.created` + `subscription.status` from payload as canonical state.

### 4. EU VAT B2B reverse charge misconfiguration
Belgian operator charging 21% VAT to German B2B customer with valid VAT ID is wrong (should be reverse charge, no VAT). Stripe Tax + VIES validation is mandatory before first invoice. Invoice text required: "Reverse charge — VAT to be accounted for by the recipient."

### 5. Workday scraping is a live legal risk
Workday EUA explicitly prohibits automated scraping. Greenhouse, Lever, Ashby, Recruitee expose documented public APIs. Convert Workday targets to a partnership conversation; don't continue silent scraping.

---

## Recommended Build Order

### Phase 1 — Production Foundation
1. Register domain (`windturbinejobs.com`)
2. Stale job removal (DB flag + 410 + remove schema + Indexing API ping)
3. GDPR: privacy policy, granular consent at subscribe, one-click unsubscribe, deletion flow
4. Email auth: SPF + DKIM + DMARC aligned, verified in mxtoolbox
5. Apply migrations 0002+0003 in Supabase

### Phase 2 — Employer Breadth (parallel with Phase 3)
6. `workers/discover` — URL probe + HTML fingerprint + confidence scoring → manual review queue
7. Manual review + adapter wiring → expand 3 to 20–50 employers
8. Convert Workday high-value targets to partnership conversation
9. Aggregator fallback (Adzuna) for employers without native adapters

### Phase 3 — Candidate Activation (parallel with Phase 2)
10. `JobPosting` JSON-LD on all detail pages (validated in Rich Results Test)
11. Description enrichment complete and shipping
12. Weekly digest worker — Cron → queue → Resend; `email_sends` idempotency constraint
13. **First 100 subscribers via active outreach** — HARD GATE before any employer pitch

### Phase 4 — Employer Product
14. Auto-generated company profile pages + "Claim this listing" CTA
15. Magic-link login + Astro middleware with `@supabase/ssr` ^0.10.0
16. `employer_id` JWT claim hook in Supabase
17. Profile editor — JSONB fields, `dompurify` sanitization, logo upload, rebuild debounce
18. `featured_until` column + partial index + sort change in `jobs.ts`
19. "Feature this job" toggle with tier-limit enforcement
20. Performance dashboard (30-day views/clicks/apply-clicks)
21. Manual claim verification flow

### Phase 5 — First Revenue
22. `workers/billing` — webhook + `constructEventAsync` + `stripe_events` idempotency + queue
23. `employer_subscriptions` table + denormalized `tier`/`subscription_active`
24. Stripe Tax + Customer Portal + VAT ID collection + VIES validation
25. Manual Stripe invoice flow (no self-serve checkout v1)
26. Daily reconciliation cron
27. Cold outreach with FOMO pitch (only after Phase 3 hard gate)

---

## Confidence + Open Gaps

| Area | Confidence |
|---|---|
| Stack picks (Stripe SDK, Supabase Auth, Resend) | HIGH |
| RLS subscription gating + featured_until sort | HIGH |
| Stripe webhook idempotency on Workers | HIGH |
| Cron + Queue digest with max_batch_size: 2 | HIGH |
| EU VAT reverse charge config | HIGH |
| 3-tier ladder feature breakdown | MEDIUM-HIGH |
| ATS auto-discovery success rate | MEDIUM (~60–70% auto-detect) |
| Workday legal risk | MEDIUM — Belgian lawyer review recommended |

**Gaps to address during planning:**
- Belgian OSS registration threshold for SaaS (check before invoicing first non-Belgian EU customer)
- `@supabase/ssr` ≥0.10.0 cache headers verified via `curl -I` after Phase 4 build
- Cloudflare Pages → Workers Static Assets migration plan (Pages in maintenance since April 2025)
- €499/€999/€1999 anchors validated by first 5 customer conversations
