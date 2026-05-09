---
phase: 01-production-foundation
verified: 2026-05-09T17:27:12Z
status: passed
score: 7/9 must-haves verified
overrides_applied: 0
deferred:
  - truth: "Resend sending domain verified (SPF + DKIM + DMARC) — INFRA-03"
    addressed_in: "Phase 5 (pre-subscriber-gate ops)"
    evidence: "Founder decision: deferred to before Phase 5 subscriber gate (01-05-SUMMARY deferred list)"
  - truth: "All Pages/Worker secrets set, frontend + worker deployed to production — INFRA-04"
    addressed_in: "Phase 5 (pre-subscriber-gate ops)"
    evidence: "Founder decision: Tasks 3-8 of Plan 01-05 deferred; RUNBOOK.md documents all required steps"
  - truth: "DATA-03 live effectiveness: Google Indexing API pings actually reach Google and deindex expired jobs in Search Console"
    addressed_in: "Phase 5 smoke test"
    evidence: "Code complete and tested; live confirmation requires production deploy (deferred)"
  - truth: "INFRA-07 live RFC 8058: Gmail/Outlook one-click unsubscribe link triggers POST handler and deletes DB row in real inbox"
    addressed_in: "Phase 5 smoke test"
    evidence: "Plan 01-06 Task 2 is checkpoint:human-verify; blocked on Resend domain being live (deferred with INFRA-03)"
---

# Phase 1: Production Foundation Verification Report

**Phase Goal:** Establish production infrastructure: stale-job lifecycle, GDPR compliance (consent, deletion, unsubscribe), and deployment runbook — all code complete and tested; production deploy deferred by founder decision to before Phase 5 subscriber gate.
**Verified:** 2026-05-09T17:27:12Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Stale job detection: `expireMissingJobs()` sets `status='expired'` + `expired_at` timestamp with outage guard (skip when fetchedJobIds empty) | VERIFIED | `workers/ingest/src/expire.ts` — outage guard line 1, update sets both fields; 8 expire tests pass |
| 2 | 90-day cleanup: `cleanupExpired()` deletes jobs where `expired_at < NOW() - 90 days` | VERIFIED | `workers/ingest/src/expire.ts` — `RETENTION_DAYS = 90`, `cleanupExpired` export; called from `index.ts` scheduled handler |
| 3 | Google Indexing API ping on expiry: `pingUrlUpdated()` uses jose RS256 JWT + OAuth2 token exchange, PING_BUDGET_PER_RUN=100 | VERIFIED | `workers/ingest/src/google-indexing.ts` — jose import (no node:crypto), 100-ping budget in expire.ts; 3 google-indexing tests + 8 expire tests pass |
| 4 | HTTP 410 for expired jobs: `[slug].astro` returns 410 with short-cache (max-age=300, no SWR) and links back to /jobs | VERIFIED | `apps/web/src/pages/jobs/[slug].astro` — status=410 branch, `setCacheHeaders(headers, 300, 0)`, "Browse open roles" link; 6 jobs.test.ts tests pass |
| 5 | Active-only listings: all 6 list/stat queries filter `status='active'`; `getJobBySlug` intentionally unfiltered | VERIFIED | `apps/web/src/lib/jobs.ts` — 6 `.eq("status","active")` calls confirmed; getJobBySlug has 0 status filter calls |
| 6 | GDPR consent: checkbox required in Newsletter.astro with multi-niche label; server enforces at line 30 (before Turnstile at line 34); `consent_given_at` written to DB | VERIFIED | `apps/web/src/components/Newsletter.astro` + `apps/web/src/pages/api/subscribe.ts`; 4 subscribe tests pass (including ordering test) |
| 7 | GDPR deletion request: /api/delete-request POST with Turnstile protection sends to `privacy@${niche.domain}` (multi-niche); form on prerendered /privacy page | VERIFIED | `apps/web/src/pages/api/delete-request.ts` line 54; `apps/web/src/pages/privacy.astro` with client-side fetch; 8 delete-request tests pass |
| 8 | RFC 8058 one-click unsubscribe headers in sendConfirmation + POST handler returning 200 (code complete) | VERIFIED | `apps/web/src/lib/resend.ts` lines 59-62 — both headers present; `apps/web/src/pages/api/unsubscribe.ts` exports GET + POST |
| 9 | Deployment runbook documents all secrets, DNS steps, migration procedure | VERIFIED | `.planning/phases/01-production-foundation/RUNBOOK.md` — [BLOCKING] tag, all 6 Pages secrets, 3 Worker secrets, Resend DNS, GCP steps, migration 0004 procedure |

**Score:** 7/9 truths verified (2 deferred: INFRA-03 Resend DNS verification, INFRA-04 live deploy — not failed, intentionally deferred by founder decision)

---

### Deferred Items

Items not yet met but explicitly addressed in later milestone phases.

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | Resend SPF/DKIM/DMARC DNS verification live | Phase 5 (pre-subscriber-gate) | 01-05-SUMMARY.md deferred list: "Task 3: Resend domain verification" |
| 2 | Cloudflare Pages secrets (6) + Worker secrets (3) set; frontend + worker deployed | Phase 5 (pre-subscriber-gate) | 01-05-SUMMARY.md deferred list: Tasks 4-8; RUNBOOK.md has all commands ready |
| 3 | Google Indexing API pings verified in Search Console after live deploy | Phase 5 smoke test | Code and tests complete; live confirmation needs production deploy |
| 4 | RFC 8058 one-click in real Gmail/Outlook inbox: POST triggers + DB row deleted | Phase 5 smoke test | Plan 01-06 Task 2 is checkpoint:human-verify; blocked on Resend domain live |

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/schema/src/migrations/0004_stale_jobs_consent.sql` | Migration DDL for status, expired_at, consent_given_at columns + RLS update | VERIFIED | All 4 DDL operations present; applied to production Supabase (confirmed in 01-05-SUMMARY) |
| `packages/schema/src/index.ts` | Job interface with status/expired_at; Subscriber with consent_given_at | VERIFIED | Both interfaces extended; exports intact |
| `workers/ingest/src/expire.ts` | expireMissingJobs + cleanupExpired + outage guard + 90-day retention | VERIFIED | All exports present; PING_BUDGET_PER_RUN=100; outage guard implemented |
| `workers/ingest/src/google-indexing.ts` | pingUrlUpdated with jose JWT, edge-only (no node:crypto) | VERIFIED | jose import confirmed; PEM unescaping; OAuth2 token exchange; URL_UPDATED type |
| `workers/ingest/src/ingest.ts` | 5 adapter call sites accumulate fetchedJobIds + call expireMissingJobs | VERIFIED | All 5 adapters wired; 23505 reactivation branch resets status to 'active' |
| `workers/ingest/src/index.ts` | GOOGLE_INDEXING_KEY in Env; cleanupExpired called in scheduled handler | VERIFIED | Env interface has optional key; cleanupExpired imported and called after each niche |
| `apps/web/src/lib/jobs.ts` | 6 status='active' filters; getJobBySlug unfiltered | VERIFIED | Confirmed by grep: 6 list/stat sites filtered, 0 in getJobBySlug |
| `apps/web/src/pages/jobs/[slug].astro` | 410 branch + short-cache + link to /jobs | VERIFIED | status=410 set; setCacheHeaders(300, 0); "Browse open roles" link present |
| `apps/web/src/components/Newsletter.astro` | Required consent checkbox + multi-niche label + client guard | VERIFIED | name="consent" required; niche.name.toLowerCase() label; client guard implemented |
| `apps/web/src/pages/api/subscribe.ts` | Consent check line 30 before Turnstile line 34; consent_given_at upsert | VERIFIED | Ordering confirmed by indexOf test in subscribe.test.ts; upsert includes timestamp |
| `apps/web/src/lib/resend.ts` | sendDeletionRequest export + RFC 8058 headers in sendConfirmation | VERIFIED | sendDeletionRequest appended; both List-Unsubscribe headers at lines 59-62 |
| `apps/web/src/pages/api/delete-request.ts` | POST handler: Turnstile + privacy@${niche.domain} recipient | VERIFIED | Multi-niche recipient at line 54; Turnstile validation; structured error responses |
| `apps/web/src/pages/privacy.astro` | prerender=true preserved; deletion form with client fetch; sub-processors section | VERIFIED | prerender intact; form section present; sub-processors heading preserved |
| `apps/web/src/pages/api/unsubscribe.ts` | GET (HTML page + delete) + POST (RFC 8058 one-click) | VERIFIED | Both handlers exported |
| `.planning/phases/01-production-foundation/RUNBOOK.md` | [BLOCKING], all secrets, DNS steps, GCP steps | VERIFIED | All items present; migration 0004 procedure documented |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `ingest.ts` adapters | `expire.ts:expireMissingJobs` | `fetchedJobIds` accumulation + call | WIRED | All 5 adapter call sites confirmed |
| `expire.ts` | `google-indexing.ts:pingUrlUpdated` | import at line 16, call at line 86 | WIRED | Import verified; call inside expiry loop |
| `index.ts` | `expire.ts:cleanupExpired` | import + call in scheduled handler | WIRED | Both confirmed |
| `[slug].astro` | `jobs.ts:getJobBySlug` | import + call; status check on result | WIRED | Unfiltered query → 410 branch on status='expired' |
| `Newsletter.astro` | `/api/subscribe` | client-side fetch with consent field | WIRED | `consent: true` in fetch body |
| `subscribe.ts` | Supabase upsert | `consent_given_at: new Date().toISOString()` | WIRED | Part of upsert object |
| `delete-request.ts` | `resend.ts:sendDeletionRequest` | import + call with `privacy@${niche.domain}` | WIRED | Template literal confirmed at line 54 |
| `privacy.astro` | `/api/delete-request` | client script fetch POST | WIRED | fetch to /api/delete-request in client script |
| `resend.ts:sendConfirmation` | RFC 8058 headers | List-Unsubscribe-Post header in sendConfirmation | WIRED | Both headers at lines 59-62 |
| `unsubscribe.ts:POST` | Supabase delete | Row deletion on one-click POST | WIRED | POST handler deletes subscriber row |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `expire.ts:expireMissingJobs` | `fetchedJobIds` | Accumulated from live ATS feed responses in ingest.ts | Yes — set populated per adapter run | FLOWING |
| `[slug].astro` | `job` | `getJobBySlug` Supabase query (real DB row) | Yes — Supabase `.single()` query | FLOWING |
| `subscribe.ts` | `consent_given_at` | `new Date().toISOString()` at request time | Yes — real timestamp on each subscribe | FLOWING |
| `delete-request.ts` | `niche.domain` | `nicheFromHost(request)` registry lookup | Yes — niche registry, not hardcoded | FLOWING |
| `google-indexing.ts` | OAuth2 token | GCP service account JSON → jose JWT → token exchange | Yes — real HTTP exchange with googleapis.com | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All 35 tests pass | `pnpm test` at workspace root | 35 tests pass, 0 failures (vitest 4.1.5, reporters:'default') | PASS |
| schema/types.test.ts (5) | included in pnpm test | status/expired_at/consent_given_at type extensions verified | PASS |
| expire.test.ts (8) | included in pnpm test | outage guard, expiry, budget, cleanup all verified | PASS |
| google-indexing.test.ts (3) | included in pnpm test | happy path, 403 error, token failure | PASS |
| upsert.test.ts (1) | included in pnpm test | 23505 reactivation sets status='active' | PASS |
| jobs.test.ts (6) | included in pnpm test | 6 status filters present, 0 in getJobBySlug | PASS |
| subscribe.test.ts (4) | included in pnpm test | consent enforcement + ordering before Turnstile | PASS |
| delete-request.test.ts (8) | included in pnpm test | multi-niche recipient, validation, success | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| DATA-01 | 01-01 | Stale-job expiry lifecycle with outage guard | SATISFIED | expire.ts: outage guard + status/expired_at update + 90-day cleanup |
| DATA-02 | 01-02 | HTTP 410 for expired jobs; active-only listings | SATISFIED | [slug].astro 410 branch; jobs.ts 6 status filters; 6 tests pass |
| DATA-03 (code) | 01-01 | Google Indexing API ping on expiry (edge-only) | SATISFIED | google-indexing.ts jose JWT; wired in expire.ts; 3 tests pass |
| DATA-03 (live) | 01-01 | Live pings verified in Search Console | DEFERRED | Requires production deploy (Phase 5 smoke test) |
| INFRA-02 | 01-05 | Deployment runbook + migration 0004 applied to production | SATISFIED | RUNBOOK.md complete; migration applied (confirmed in 01-05-SUMMARY) |
| INFRA-03 | 01-05 | Resend domain DNS verified (SPF/DKIM/DMARC) | DEFERRED | Founder decision; RUNBOOK.md documents steps; deferred to Phase 5 |
| INFRA-04 | 01-05 | All secrets set; frontend + worker deployed | DEFERRED | Founder decision; RUNBOOK.md has all commands; deferred to Phase 5 |
| INFRA-06 | 01-03 | GDPR consent checkbox wired end-to-end | SATISFIED | Newsletter.astro + subscribe.ts + DB write; 4 tests pass |
| INFRA-07 | 01-06 | RFC 8058 one-click unsubscribe (code + live) | SATISFIED (code) / DEFERRED (live) | Headers + POST handler verified; live test deferred with Resend DNS |
| INFRA-08 | 01-04 | GDPR Article 17 deletion request flow | SATISFIED | delete-request.ts + sendDeletionRequest + privacy.astro form; 8 tests pass |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `workers/ingest/src/ingest.ts` | varies | `"not yet implemented"` for unknown ATS type | INFO | Valid warning log for unrecognized ATS — not a stub; all 5 known adapters are implemented |
| `apps/web/src/pages/privacy.astro` | 87 | Hardcoded `mailto:privacy@windturbinejobs.com` in body copy | INFO | Pre-existing (before Phase 1); not in new GDPR deletion form code; multi-niche source-contract test guards the new endpoint |
| `apps/web/src/components/ui/Input.astro` | 17 | `ts(2322)` typecheck error | INFO | Pre-existing from initial commit; not introduced by Phase 1; tracked for future fix |

No blockers found. All anti-patterns are pre-existing or informational.

---

### Human Verification Required

These items require production infrastructure to be live (blocked on Phase 5 deploy):

**1. Resend domain live — SPF/DKIM/DMARC**

Test: After Resend DNS records propagate, send a test email and verify headers in raw email source.
Expected: Both `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers present.
Why human: Requires live Resend sending domain and real email client.

**2. RFC 8058 one-click POST handler**

Test: `curl -sX POST -w "%{http_code}" "<unsubscribe-URL>"` against production URL.
Expected: Response body "OK" with HTTP 200; Supabase row deleted.
Why human: Requires production deploy with live Resend domain.

**3. HTTP 410 in production**

Test: Visit a job URL for an expired job on windturbinejobs.com.
Expected: HTTP 410 with "no longer available" content; cache headers max-age=300.
Why human: Requires production deploy and at least one expired job in DB.

**4. Google Indexing API cron run**

Test: After GCP service account configured and worker deployed, check cron run logs.
Expected: `pinged` counter > 0 in IngestStats; no `pingFailures`.
Why human: Requires GCP service account JSON in GOOGLE_INDEXING_KEY secret + production deploy.

**5. GDPR deletion form submission**

Test: Submit deletion form on /privacy page with a real email and valid Turnstile.
Expected: "We received your request..." success message; email arrives at privacy@windturbinejobs.com.
Why human: Requires Resend domain live + privacy@ mailbox configured.

---

### Gaps Summary

No gaps. All Phase 1 code deliverables are complete and tested (35/35 tests pass). Four items are deferred by founder decision and explicitly documented in RUNBOOK.md for completion before the Phase 5 subscriber gate:

1. Resend domain DNS verification (INFRA-03)
2. Pages/Worker secrets + production deploy (INFRA-04)
3. Google Indexing API live effectiveness (DATA-03 live)
4. RFC 8058 live inbox verification (INFRA-07 live, Plan 01-06 Task 2)

These are operational tasks, not code defects. The code is production-ready. The RUNBOOK.md provides step-by-step instructions for all deferred tasks.

---

_Verified: 2026-05-09T17:27:12Z_
_Verifier: Claude (gsd-verifier)_
