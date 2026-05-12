# Phase 4: Employer Product - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-12
**Phase:** 4-Employer Product
**Areas discussed:** Claim flow & auth, Dashboard scope, Analytics tracking, Featured jobs display, Location/SEO landing pages

---

## Claim flow & auth

| Option | Description | Selected |
|--------|-------------|----------|
| Email domain match (auto-approve) | Employer enters work email; system checks against employers.domain; auto-approved on match | ✓ |
| Self-serve, manual founder review | Claim request sits pending until founder approves in Supabase | |
| No verification — just link email | Anyone can claim any employer; simplest to build | |

**User's choice:** Email domain match (auto-approve)

---

| Option | Description | Selected |
|--------|-------------|----------|
| Add domain field to employers table | Nullable TEXT column, manually populated or from ATS URL | ✓ |
| Derive from canonical_url during ingest | Parse domain from job's canonical_url automatically | |

**User's choice:** Add domain field to employers table

---

| Option | Description | Selected |
|--------|-------------|----------|
| employer_users join table | auth_id + employer_id; supports multiple users per employer | ✓ |
| auth_id column on employers | Single user per employer; simpler but limited | |

**User's choice:** employer_users join table

---

## Dashboard scope

| Option | Description | Selected |
|--------|-------------|----------|
| Build edit form now, show as locked | Full edit UI in Phase 4; gated with "Available on paid plan" | ✓ |
| Read-only dashboard in Phase 4 | No edit form until Phase 5 billing is built | |

**User's choice:** Build edit form now, show as locked

---

| Option | Description | Selected |
|--------|-------------|----------|
| Unlimited featured slots in Phase 4 | No billing enforcement yet; Phase 5 adds limits | ✓ |
| 1 featured slot for all in Phase 4 | Mirrors free-tier model from day one | |

**User's choice:** Unlimited

---

| Option | Description | Selected |
|--------|-------------|----------|
| /dashboard | Single protected route | ✓ |
| /employers/[slug]/dashboard | Nested under employer public profile | |

**User's choice:** /dashboard

---

## Analytics tracking

| Option | Description | Selected |
|--------|-------------|----------|
| Cloudflare Workers Analytics Engine | Edge-native, free, purpose-built for events | ✓ |
| Supabase job_events table | DB write per event; expensive at scale | |
| Third-party (Plausible/Fathom) | External service; ~€9-19/mo; can't query for API | |

**User's choice:** Cloudflare Workers Analytics Engine

---

| Option | Description | Selected |
|--------|-------------|----------|
| Server-side in Pages Functions | View in [slug].astro; apply-click via /api/track redirect | ✓ |
| Client-side script tag | sendBeacon + onclick; blocked by ad-blockers | |

**User's choice:** Server-side in Pages Functions

---

| Option | Description | Selected |
|--------|-------------|----------|
| Query Analytics Engine SQL API from Pages Function | /api/stats calls CF SQL API; no Supabase writes | ✓ |
| Nightly aggregate to Supabase via cron | Daily cron syncs to Supabase; more resilient but more infra | |

**User's choice:** Direct query from Pages Function

---

## Featured jobs display

| Option | Description | Selected |
|--------|-------------|----------|
| Separate query for featured jobs, shown first | Active featured_until jobs fetched separately, rendered above regular list | ✓ |
| Sort all jobs with ORDER BY (featured_until > NOW()) DESC | Featured bubble to top via single query | |

**User's choice:** Separate query, shown first

---

| Option | Description | Selected |
|--------|-------------|----------|
| 30 days default duration | featured_until = NOW() + 30 days | ✓ |
| Until manually removed | featured_until = NULL = featured forever | |

**User's choice:** 30 days

---

| Option | Description | Selected |
|--------|-------------|----------|
| Existing FeaturedJobCard.astro + SponsoredBadge.astro | Wire to real DB data | ✓ |
| — | — | |

**Notes:** User confirmed "what I have now on the homepage as dummy is what I want it to be" — existing components are the target design.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Defer homepage employer carousel (FEAT-04) to Phase 5 | No billing = no scarcity enforcement | ✓ |
| Include carousel in Phase 4 | Build now for FOMO pitch visuals | |

**User's choice:** Defer to Phase 5

---

## Location / SEO landing pages

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-generated from job data | Scan DB for distinct locations | |
| Curated list of target cities | Defined in niche config | ✓ |

**User's choice:** Curated list in niche config

---

| Option | Description | Selected |
|--------|-------------|----------|
| Same design as /jobs (filtered listing) | Reuse listing UI, pre-filtered | |
| Intro paragraph + job list | Auto-generated intro + filtered listing | ✓ |

**User's choice:** Intro paragraph + job list (same design as /jobs but with intro)

---

| Option | Description | Selected |
|--------|-------------|----------|
| Add to Phase 4 scope | Frontend-only; fits alongside company profile pages | ✓ |
| Separate phase | Keep Phase 4 focused | |

**User's choice:** Add to Phase 4

---

**Notes:** User clarified the full vision — not just location pages but a broader pattern including job-type/specialty pages:
- `/wind-turbine-jobs-austin-tx` (location)
- `/entry-level-wind-turbine-jobs` (seniority)
- `/offshore-wind-farm-jobs` (specialty)
- `/blade-repair-technician-jobs-berlin-de` (specialty + location)

All follow the same pattern: a slug → filters (keywords + optional location) → filtered job listing + intro paragraph. Defined as `landingPages[]` in niche config.

---

## Claude's Discretion

- Logo.dev auto-fetch implementation detail (use `employers.domain` as lookup key, fall back to initials)
- RLS policy specifics for `employer_users` and `/dashboard` route
- Exact Astro routing approach for flat URL landing pages

## Deferred Ideas

- Homepage employer carousel (FEAT-04) → Phase 5 (Tier 2+ paid feature)
- Multi-user employer account management (invite team members) → future phase
