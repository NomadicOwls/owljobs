# STATE

_Project memory. Updated continuously across sessions._

## Project Reference

- **Name:** OwlJobs (niche 1: Wind Turbine Jobs)
- **Core value:** Be the only place wind turbine technicians find all relevant open roles — creating a candidate audience employers will pay to reach before competitors do.
- **Current focus:** Phase 1 — Production Foundation
- **Mode:** mvp
- **Granularity:** standard

## Current Position

- **Phase:** 1 — Production Foundation (Planned — ready to execute)
- **Plan:** 6 plans in 4 waves (see `.planning/phases/01-production-foundation/`)
- **Status:** Phase 1 planned, run `/gsd-execute-phase 1` to begin
- **Progress:** [░░░░░░░░░░] 0% (0/5 phases complete)

## Performance Metrics

| Metric | Value |
|--------|-------|
| Phases complete | 0 / 5 |
| Plans complete | 0 / 6 |
| Requirements satisfied | 0 / 43 |
| Confirmed subscribers | 0 / 100 (hard gate for Phase 5) |
| Employers ingested | 3 / 20 (hard gate for Phase 5) |
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

- Execute Phase 1: run `/gsd-execute-phase 1`

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

- **Date:** 2026-05-09
- **Action:** Phase 1 planned — 6 plans in 4 waves. Research: jose@6.2.3 for Google JWT on Workers, INFRA-07 already implemented, Supabase migration 0004 (status+expired_at on jobs, consent_given_at on subscribers). Plans verified by plan-checker (2 blockers fixed: VALIDATION.md created, Plan 05 Task 7 acceptance_criteria corrected).
- **Stopped at:** Phase 1 planning complete
- **Resume file:** `.planning/phases/01-production-foundation/01-01-PLAN.md`
- **Next action:** Run `/gsd-execute-phase 1` to execute Phase 1 plans

### Files of Record

- `.planning/PROJECT.md` — vision, constraints, key decisions
- `.planning/REQUIREMENTS.md` — 43 v1 requirements with traceability
- `.planning/research/SUMMARY.md` — stack picks, build order, critical warnings
- `.planning/ROADMAP.md` — 5 phases, success criteria, coverage map
- `.planning/codebase/ARCHITECTURE.md` — current implemented architecture
- `.planning/config.json` — mode/granularity/workflow settings
