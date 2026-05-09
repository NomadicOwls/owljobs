---
plan: 01-05
phase: 01-production-foundation
status: partial
requirements_satisfied:
  - INFRA-02
deferred:
  - INFRA-03
  - INFRA-04
  - DATA-03
self_check: DEFERRED
---

# Plan 01-05 Summary — Production Ops Runbook

## What Was Built

- **RUNBOOK.md** created at `.planning/phases/01-production-foundation/RUNBOOK.md` — full deployment runbook covering migrations, Resend DNS, Pages/Worker secrets, GCP service account, Cloudflare Email Routing, deploy commands, and smoke checklist.
- **Migration 0004 applied to production** Supabase via Management API — `wind_turbine.jobs.status`, `wind_turbine.jobs.expired_at`, `wind_turbine.subscribers.consent_given_at` all verified live. RLS policy `public_relevant_jobs` updated to filter `status = 'active'`.

## Deferred (to final phase)

Production ops tasks 3–8 deferred by founder decision — will complete before Phase 5 subscriber gate:

- Task 3: Resend domain verification (SPF + DKIM + DMARC)
- Task 4: Cloudflare Pages secrets (6) + Worker secrets (3)
- Task 5: GCP service account + Indexing API + Search Console + JobPosting allow-list
- Task 6: `privacy@windturbinejobs.com` mailbox forwarder
- Task 7: Frontend + worker deploy
- Task 8: End-to-end production smoke test

## Self-Check

- [x] RUNBOOK.md exists and contains `[BLOCKING]`, all secret names, Resend DNS steps, GCP steps
- [x] Migration 0004 applied and verified in production
- [ ] Resend domain verified — deferred
- [ ] Pages/Worker secrets set — deferred
- [ ] GCP + Search Console configured — deferred
- [ ] Production deploy live — deferred
