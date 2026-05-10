# STATE

_Project memory. Updated continuously across sessions._

## Project Reference

- **Name:** OwlJobs (niche 1: Wind Turbine Jobs)
- **Core value:** Be the only place wind turbine technicians find all relevant open roles — creating a candidate audience employers will pay to reach before competitors do.
- **Current focus:** Phase 2 — Employer Breadth & SEO
- **Mode:** mvp
- **Granularity:** standard

## Current Position

- **Phase:** 2 — Employer Breadth & SEO (Executing)
- **Plan:** 5/8 plans complete (02-01 ✓, 02-02 ✓, 02-03 ✓, 02-04 ✓, 02-08 ✓)
- **Status:** Phase 2 executing (2026-05-11). Wave 2 complete. Wave 3 starting (02-05 SmartRecruiters).
- **Progress:** [██░░░░░░░░] 20% (1/5 phases complete)

## Performance Metrics

| Metric | Value |
|--------|-------|
| Phases complete | 1 / 5 |
| Plans complete | 6 / 6 (phase 1) |
| Requirements satisfied | 8 / 43 (DATA-01, DATA-02, DATA-03 code, INFRA-06, INFRA-07, INFRA-08, INFRA-02 runbook; INFRA-03/04 deferred) |
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

- Complete deferred ops before Phase 5: Resend DNS, Pages/Worker secrets, GCP service account, production deploy, RFC 8058 live smoke test (see RUNBOOK.md)

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

- **Date:** 2026-05-10
- **Action:** Phase 2 context gathered — 4 areas discussed (discovery script, Adzuna integration, JSON-LD missing fields, employer expansion). 20 implementation decisions captured in 02-CONTEXT.md. Key decisions: `workers/discover` Worker with Supabase `candidates` table, Adzuna+JSearch as dual aggregator, JSON-LD only for enriched jobs, SmartRecruiters adapter to build, Trakstar adapter for Ørsted (with aggregator fallback if fragile).
- **Stopped at:** Phase 2 context gathered
- **Next action:** `/gsd-plan-phase 2` — plan employer breadth & SEO

### Files of Record

- `.planning/PROJECT.md` — vision, constraints, key decisions
- `.planning/REQUIREMENTS.md` — 43 v1 requirements with traceability
- `.planning/research/SUMMARY.md` — stack picks, build order, critical warnings
- `.planning/ROADMAP.md` — 5 phases, success criteria, coverage map
- `.planning/codebase/ARCHITECTURE.md` — current implemented architecture
- `.planning/config.json` — mode/granularity/workflow settings
