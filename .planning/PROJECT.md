# OwlJobs

## What This Is

A multi-niche job board aggregation engine that pulls jobs directly from employer ATS systems, classifies them with AI, and serves them to niche talent audiences. The first niche is wind turbine technicians ("Wind Turbine Jobs"). No competitor niche job board exists in this space. The business model is employer subscriptions: companies pay for featured placement, company profile pages, and candidate match alerts once a candidate audience worth reaching is built.

## Core Value

Be the only place where wind turbine technicians find all relevant open roles — creating an audience employers will pay to reach before their competitors do.

## Requirements

### Validated

These capabilities exist in the codebase today.

- ✓ ATS ingest pipeline — Workday, SuccessFactors, Greenhouse, Recruitee, Softgarden adapters — existing
- ✓ AI classification — bge-small-en-v1.5 embeddings + Llama 3.1 fallback, cosine threshold (0.72 / 0.50) — existing
- ✓ 3-stage async pipeline — ingest → classify → enrich via Cloudflare Queues — existing
- ✓ Description enrichment worker — `fetch-description.ts` (in progress, untracked) — existing
- ✓ Astro SSR frontend on Cloudflare Pages — job listings, employer pages, feeds, sitemap — existing
- ✓ Newsletter double-opt-in — Resend + Turnstile bot protection — existing
- ✓ Multi-niche architecture — per-niche Supabase schema, niche registry — existing
- ✓ 300+ jobs in DB across 3 employers (GE Vernova, Vestas, NextEra Energy) — existing

### Active

These are what needs to be built to reach consistent MRR.

**Phase 1 — Production foundation & data quality**
- [ ] Domain registered and pointed to Cloudflare Pages (credibility for employer outreach)
- [ ] Migrations 0002+0003 applied in Supabase (RLS + subscribers multi-niche schema)
- [ ] Resend sending domain verified (SPF/DKIM/DMARC) — prerequisite for email alerts
- [ ] All 6 environment secrets set in Cloudflare Pages (`wrangler pages secret put`)
- [ ] GDPR compliance: privacy policy page, consent at subscribe, unsubscribe flow, data deletion request
- [ ] Stale job detection and removal — jobs currently live forever after ingest

**Phase 2 — Employer breadth**
- [ ] Auto-discovery script: scan longlist employers for ATS signatures (Workday/SF/Greenhouse URLs)
- [ ] Expand from 3 to 20–50 employers ingested — threshold for a credible employer pitch
- [ ] Aggregator fallback (Adzuna/JSearch) to fill coverage gaps for employers without native adapters

**Phase 3 — Candidate activation** ✓ Complete (2026-05-12)
- ✓ Weekly digest worker deployed — `owljobs-digest` cron `0 6 * * 1`, queue fan-out, Resend batch, RFC 8058 unsubscribe, idempotency via `email_sends` UNIQUE constraint
- ✓ RFC 8058 soft-delete unsubscribe — GET + POST handlers, POST unconditional 200 (no token enumeration)
- ✓ Migration 0006 applied — `email_sends.sent_date` + `type` columns + UNIQUE constraint live in production
- ✓ Newsletter social proof — "420+ jobs from 20+ employers" on subscribe form (D-12)
- [ ] Resend domain setup pending — `digest@windturbinejobs.com` sender auth required before first digest send
- [ ] First 100 confirmed subscribers — ops milestone, tracked in STATE.md, gates Phase 5 entry

**Phase 4 — Employer product**
- [ ] Company profile pages: auto-generated from ingest data (name, open roles, location)
- [ ] "Claim this listing" CTA on auto-generated company pages
- [ ] Employer-editable company page content (description, logo, structured fields) — unlocked at paid tier
- [ ] Featured placement: pinned/highlighted jobs in listing for paying employers
- [ ] Candidate match alert emails triggered per employer when new matching subscriber arrives

**Phase 5 — Monetization**
- [ ] 3-tier employer subscription via Stripe (exact tier design: planning phase)
- [ ] Employer dashboard: manage subscription, edit company page, view featured listings
- [ ] Manual employer onboarding workflow for first 5 customers
- [ ] Cold outreach template: FOMO pitch ("your competitor X already has N jobs here")

### Out of Scope

- **Direct apply flow** — would require building an ATS inbox, application tracking, two-sided notifications. Too complex for v1. Apply links route to employer's own ATS.
- **Self-serve employer sign-up** — first customers onboarded manually by founder. Self-serve Stripe checkout deferred to after first paying customers validate the model.
- **Candidate accounts / profiles** — candidates are email-only for now. No CV upload, no saved jobs, no login.
- **Multi-language** — English only. Wind industry job postings are predominantly English globally.
- **New niches in v1** — wind turbine is the experiment. Niche 2 launches after the wind model proves MRR.
- **Tier pricing UI** — three tiers confirmed but exact feature breakdown to be designed during planning, not pre-committed here.

## Context

**First-mover:** No competing niche job board found for wind turbine technicians. Opportunity exists to own the space before others notice.

**The monetization sequence that works:** You can't sell employer visibility on an empty site. The sequence is: (1) make job pages indexable and valuable via enrichment + SEO, (2) expand employer breadth to 20–50 so the site has credibility, (3) activate the candidate email list through active outreach, (4) pitch employers using FOMO — "your competitor's 30 jobs are already here, here's what featured placement gets you."

**The FOMO pitch requires a number:** Even 50–100 subscribers makes the cold-call credible. Without any audience figure, the pitch stalls at "how many candidates are looking?"

**Employer pricing target:** €500–€2000+/mo. At this price point, 3–5 customers = meaningful MRR. This is founder-led sales territory, not a self-serve funnel.

**Domain is unregistered:** `windturbinejobs.com` is the target but not yet bought. Cold outreach from a `.pages.dev` domain is not credible at €500+/mo. Domain registration is task zero.

**Architecture is multi-niche ready:** Each niche = one Supabase schema, one niche TS config file, one domain. New niches require a code deploy — acceptable for now.

**Stale jobs are a silent trust killer:** Jobs that filled months ago still appear in listings. Every candidate who applies to a closed role damages credibility. Fix this before driving candidate traffic.

**Current DB:** 300+ jobs, wind turbine schema, 3 employers. Enough to demo but thin for a pitch. 20–50 employers needed for breadth.

## Constraints

- **Tech**: Cloudflare Workers + Supabase + Astro on Pages — no traditional server. All new features must work within this edge-native stack.
- **Multi-niche by design**: Every new feature must support arbitrary niches. No wind-turbine-specific hardcoding in new code.
- **Legal**: GDPR compliance required. Belgian operator, EU law, global email list. Cannot launch email alerts without consent + unsubscribe + deletion flows.
- **Platform**: workerd requires macOS 13+ for local dev via `wrangler pages dev`. Build + deploy works on all OS. Known limitation, not a blocker.
- **Revenue timeline**: 1–3 months to first paying customer. Scope decisions should prioritize what unblocks employer outreach over what makes the product comprehensive.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Employer subscriptions as primary revenue | One-off job posts commoditize; recurring subscription builds predictable MRR | — Pending |
| Manual founder-led sales for first 5 customers | Self-serve can't close €500/mo deals cold; founder needs to understand objections first | — Pending |
| Email-only candidates (no accounts) | Reduces friction to subscribe; no auth complexity; sufficient for email alert delivery | — Pending |
| Direct apply cut from v1 | Would require building a second ATS; 6+ weeks of complexity that doesn't directly drive first revenue | — Pending |
| Auto-discovery script for employer expansion | 150-employer longlist exists; manual ATS research per employer is too slow to reach 20–50 target | — Pending |
| FOMO outreach strategy | Seed with big player jobs (GE Vernova, Vestas); cold-pitch competitors before they notice | — Pending |

---
*Last updated: 2026-05-09 after project initialization*

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state
