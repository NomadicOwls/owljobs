---
phase: 04-employer-product
plan: 10
subsystem: digest-worker
tags: [phase-4, employer-product, digest-worker, employer-alerts, ANLYT-02]
dependency_graph:
  requires: [04-01, 04-06, 04-07, 04-08]
  provides: [employer-alert-email-delivery]
  affects: [workers/digest]
tech_stack:
  added: []
  patterns: [cron-queue-consumer, multi-niche-iteration, resend-email, msg-ack-retry]
key_files:
  created: []
  modified:
    - workers/digest/wrangler.toml
    - workers/digest/src/index.ts
decisions:
  - "Extend existing digest worker (Pattern 10) rather than create new worker — all wiring already exists"
  - "Skip idempotency in Phase 4 — double-fire produces 2 identical emails, acceptable; Phase 5 will extend email_sends table"
  - "Use BREVO_API_KEY env var for Resend auth — keep name consistent with existing digest binding"
  - "Recipient email fetched from auth.users via auth.admin.getUserById(auth_id) — not user-supplied input"
metrics:
  duration: "~15 min"
  completed: "2026-05-13"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 2
---

# Phase 4 Plan 10: Employer Match Alert Email Delivery Summary

Weekly employer-alert pipeline added to the digest worker: second cron trigger fans out per-employer queue messages; consumer sends Resend emails with subscriber count and dashboard CTA. ANLYT-02 end-to-end complete.

## What Was Built

### Task 1: wrangler.toml extended (commit `73999c0`)

- Added second cron `"0 8 * * 1"` (Monday 08:00 UTC, 2 h after digest to avoid DB pressure)
- Added `EMPLOYER_ALERTS` queue producer binding (`owljobs-employer-alerts`)
- Added `EMPLOYER_ALERTS` queue consumer: `max_batch_size=5`, `max_retries=2`, DLQ `owljobs-employer-alerts-dlq`
- Existing `DIGEST_QUEUE` binding and `owljobs-digest-dlq` unchanged

wrangler.toml now has: 2 crons, 2 queue producers, 2 queue consumers, 2 DLQs.

### Task 2: src/index.ts extended (commit `de7ec88`)

Lines added: 152. No existing lines removed or modified (existing digest path intact).

New types:
- `EmployerAlertMessage` — `{ nicheId, employerId, employerName, recipientEmail, subscriberCount, weekEndingISO }`
- `Env.EMPLOYER_ALERTS: Queue<EmployerAlertMessage>` added alongside existing bindings

New functions:
- `scheduleEmployerAlerts(env, ctx)` — producer; iterates `getAllNiches()`, counts confirmed subscribers `>= sevenDaysAgoISO` (7 * 24 * 60 * 60 * 1000 ms), queries `employer_users` for claimed employers, looks up email via `auth.admin.getUserById`, enqueues to `EMPLOYER_ALERTS`
- `processEmployerAlertsBatch(batch, env)` — consumer; builds Resend email payload with subject `{N} new candidates joined {niche} this week`, posts to `https://api.resend.com/emails`, `msg.ack()` on success, `msg.retry()` on 5xx or exception

Handler changes:
- `scheduled()` branches on `event.cron === "0 8 * * 1"` → `scheduleEmployerAlerts`; all other crons fall through to the existing digest path
- `queue()` branches on `batch.queue === "owljobs-employer-alerts"` → `processEmployerAlertsBatch`; all other queues fall through to existing digest consumer

## Test Results

| Test file | Before | After |
|-----------|--------|-------|
| employer-alert.test.ts | 3 FAIL (RED) | 3 PASS (GREEN) |
| digest.test.ts | 14 PASS | 14 PASS |
| idempotency.test.ts | 4 PASS | 4 PASS |

All 21 tests pass. Typecheck: 0 errors.

## Known Limitations

### Idempotency gap (T-04-40, accepted)

If the cron fires twice in the same Monday window, an employer receives two identical emails. Documented limitation for Phase 4. Phase 5 will extend the `email_sends` table to cover employer alert sends (`type = 'employer_alert'`), providing the same 23505-based guard used for subscriber digests.

### DMARC/SPF assumption (T-04-39, mitigated by infra)

The `from` address is `alerts@${niche.domain}`. Requires Resend SPF/DKIM DNS records for `niche.domain` (INFRA-03 from Phase 1). If DNS is not configured, emails will arrive in spam. No code change needed — this is a deployment pre-condition.

### Email API key naming

`BREVO_API_KEY` env var is reused for the Resend API key in employer alerts. The name is legacy from the subscriber digest implementation; functionally it carries the Resend bearer token. Not changed to avoid breaking existing secrets configuration.

## Multi-Niche Compliance

All new code iterates `getAllNiches()`. The only occurrence of `wind_turbine` in the file is a comment in the `EmployerAlertMessage` docstring (line 17). No runtime hardcoding.

## Phase 4 Completion

Plan 10 is the last plan in Phase 4. All 10 plans delivered:

| Plan | Name | REQ-IDs |
|------|------|---------|
| 01 | DB migrations + worker stubs | foundation |
| 02 | Ingest pipeline | INGEST-* |
| 03 | Discover worker | DISC-* |
| 04 | Claim flow | CLAIM-* |
| 05 | Magic link auth | AUTH-* |
| 06 | RLS policies | SEC-* |
| 07 | Job feature/billing | BILL-* |
| 08 | Analytics dashboard | ANLYT-01 |
| 09 | Frontend employer pages | UX-* |
| 10 | Employer alert email | ANLYT-02 |

ANLYT-02 is now end-to-end: dashboard subscriber count card (plan 08) + weekly email delivery (this plan).

## Threat Surface

No new network endpoints introduced. Consumer sends outbound email only. Recipient addresses sourced from `auth.users` (service role, not user input). See plan's threat model for full STRIDE analysis (T-04-36 through T-04-40).

## Deviations from Plan

None. Plan executed exactly as written.

## Self-Check: PASSED

- `workers/digest/wrangler.toml` exists and contains both crons, both queues, both DLQs
- `workers/digest/src/index.ts` contains `EMPLOYER_ALERTS`, `EmployerAlertMessage`, `scheduleEmployerAlerts`, `processEmployerAlertsBatch`, `getAllNiches`, `"0 8 * * 1"`, `7 * 24 * 60 * 60 * 1000`
- Commit `73999c0`: wrangler.toml task 1
- Commit `de7ec88`: src/index.ts task 2
- All 21 tests pass (3 RED→GREEN + 18 no-regression)
