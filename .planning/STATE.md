# STATE

_Project memory. Updated continuously across sessions._

## Project Reference

- **Name:** OwlJobs (niche 1: Wind Turbine Jobs)
- **Core value:** Be the only place wind turbine technicians find all relevant open roles — creating a candidate audience employers will pay to reach before competitors do.
- **Current focus:** Phase 1 — Production Foundation
- **Mode:** mvp
- **Granularity:** standard

## Current Position

- **Phase:** 1 — Production Foundation (Not started)
- **Plan:** none yet (run `/gsd-plan-phase 1`)
- **Status:** Roadmap created, awaiting first phase planning
- **Progress:** [░░░░░░░░░░] 0% (0/5 phases complete)

## Performance Metrics

| Metric | Value |
|--------|-------|
| Phases complete | 0 / 5 |
| Plans complete | 0 / 0 |
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

- None — awaiting Phase 1 planning

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
- **Action:** Initial project planning — PROJECT.md, REQUIREMENTS.md, research/SUMMARY.md, ROADMAP.md created
- **Next action:** Run `/gsd-plan-phase 1` to decompose Phase 1 (Production Foundation) into executable plans

### Files of Record

- `.planning/PROJECT.md` — vision, constraints, key decisions
- `.planning/REQUIREMENTS.md` — 43 v1 requirements with traceability
- `.planning/research/SUMMARY.md` — stack picks, build order, critical warnings
- `.planning/ROADMAP.md` — 5 phases, success criteria, coverage map
- `.planning/codebase/ARCHITECTURE.md` — current implemented architecture
- `.planning/config.json` — mode/granularity/workflow settings
