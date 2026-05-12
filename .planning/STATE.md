---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: planning
stopped_at: Phase 4 context gathered
last_updated: "2026-05-12T09:46:47.723Z"
progress:
  total_phases: 5
  completed_phases: 3
  total_plans: 22
  completed_plans: 22
  percent: 100
---

# STATE

_Project memory. Updated continuously across sessions._

## Project Reference

- **Name:** OwlJobs (niche 1: Wind Turbine Jobs)
- **Core value:** Be the only place wind turbine technicians find all relevant open roles — creating a candidate audience employers will pay to reach before competitors do.
- **Current focus:** Phase 3 — Candidate Activation
- **Mode:** mvp
- **Granularity:** standard

## Current Position

Phase: 3 (Candidate Activation) — EXECUTING
Plan: 1 of 4

- **Phase:** 4
- **Plan:** Not started
- **Status:** Ready to plan
- **Progress:** [████░░░░░░] 40% (2/5 phases complete)

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

- **Date:** 2026-05-11
- **Action:** Phase 3 planned. 4 plans (03-01 through 03-04) covering CAND-01 to CAND-04. Research, pattern map, and validation strategy complete.
- **Stopped at:** Phase 4 context gathered
- **Next action:** `/gsd-execute-phase 3` — execute Phase 3 (weekly digest worker + subscriber acquisition)

### Files of Record

- `.planning/PROJECT.md` — vision, constraints, key decisions
- `.planning/REQUIREMENTS.md` — 43 v1 requirements with traceability
- `.planning/research/SUMMARY.md` — stack picks, build order, critical warnings
- `.planning/ROADMAP.md` — 5 phases, success criteria, coverage map
- `.planning/codebase/ARCHITECTURE.md` — current implemented architecture
- `.planning/config.json` — mode/granularity/workflow settings
