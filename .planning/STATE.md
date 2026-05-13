---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Phase 4 executing — Wave 0 in progress
last_updated: "2026-05-13T00:00:00.000Z"
progress:
  total_phases: 5
  completed_phases: 3
  total_plans: 32
  completed_plans: 22
  percent: 44
---

# STATE

_Project memory. Updated continuously across sessions._

## Project Reference

- **Name:** OwlJobs (niche 1: Wind Turbine Jobs)
- **Core value:** Be the only place wind turbine technicians find all relevant open roles — creating a candidate audience employers will pay to reach before competitors do.
- **Current focus:** Phase 4 — Employer Product
- **Mode:** mvp
- **Granularity:** standard

## Current Position

Phase: 4 (Employer Product) — EXECUTING
Plan: 1 of 10

- **Phase:** 4
- **Plan:** 04-01 (Wave 0 — schema foundation + test stubs)
- **Status:** Executing
- **Progress:** [████░░░░░░] 44% (3/5 phases complete — Phase 4 executing)

## Performance Metrics

| Metric | Value |
|--------|-------|
| Phases complete | 1 / 5 |
| Plans complete | 6 / 6 (phase 1) |
| Requirements satisfied | 22 / 43 (Phase 1 + Phase 2 SEO/Data/Infra requirements) |
| Confirmed subscribers | 0 / 100 (hard gate for Phase 5) |
| Employers ingested | 20 / 20 (native ATS targets configured — hard gate met) |
| Paying customers | 0 |

## Accumulated Context

### Key Decisions Logged

- Employer subscriptions chosen as primary revenue model (recurring > one-off posts)
- Manual founder-led sales for first 5 customers (self-serve deferred)
- Email-only candidates — no auth, no profiles, no CV uploads
- Direct apply cut from v1 — apply links route to employer ATS
- Stripe is source of truth; Supabase is read-side cache
- Three Workers (ingest / billing / discover) — isolated security contexts
- `featured_until TIMESTAMPTZ` self-expiring sort (single nullable timestamp on `jobs`)

### Active Todos

- Complete deferred ops before Phase 5: Resend DNS, Pages/Worker secrets, GCP service account, production deploy, RFC 8058 live smoke test (see RUNBOOK.md)
- CAND-04 outreach milestone: run `SELECT COUNT(*) FROM wind_turbine.subscribers WHERE confirmed_at IS NOT NULL` periodically and track toward ≥100 hard gate (required before Phase 5 entry). Newsletter social proof copy "420+ jobs from 20+ employers" live on subscribe form to drive conversion.

### Blockers

- None

### Anti-Patterns to Avoid (from research)

- Do NOT cold-pitch employers before ≥100 confirmed subscribers + ≥20 employers ingested
- Do NOT leave stale jobs in DB — Google manual action risk for the whole domain
- Do NOT use sync `constructEvent` for Stripe webhooks on Workers (use `constructEventAsync` + WebCrypto)
- Do NOT continue scraping Workday — convert high-value targets to partnership conversation
- Do NOT charge B2B EU customers 21% VAT without VIES validation (reverse charge required)
- Do NOT loop and send inside the cron handler — Cron → enqueue → consumer renders + sends

## Session Continuity

### Last Session

- **Date:** 2026-05-13
- **Action:** Phase 4 planned. 10 plans (04-01 through 04-10) covering PROF-01–06, FEAT-01–04, ANLYT-01–02. Research, pattern map, validation strategy, and UI-SPEC complete. Plan checker passed (2 blockers fixed in revision round 1).
- **Stopped at:** Phase 4 planned — all plans verified
- **Next action:** `/gsd-execute-phase 4` — execute Phase 4 (employer product: claim flow, auth, dashboard, featured jobs, analytics, SEO landing pages)

### Files of Record

- `.planning/PROJECT.md` — vision, constraints, key decisions
- `.planning/REQUIREMENTS.md` — 43 v1 requirements with traceability
- `.planning/research/SUMMARY.md` — stack picks, build order, critical warnings
- `.planning/ROADMAP.md` — 5 phases, success criteria, coverage map
- `.planning/codebase/ARCHITECTURE.md` — current implemented architecture
- `.planning/config.json` — mode/granularity/workflow settings
