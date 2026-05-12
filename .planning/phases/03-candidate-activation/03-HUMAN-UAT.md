---
status: partial
phase: 03-candidate-activation
source: [03-VERIFICATION.md]
started: 2026-05-12T00:00:00Z
updated: 2026-05-12T00:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Run `supabase db push` (migration 0006)
expected: Migration 0006_email_sends_idempotency.sql applied to production; `\d email_sends` shows UNIQUE constraint `email_sends_subscriber_date_type_key`; columns `sent_date` (DATE) and `type` (TEXT) present
result: [pending]

### 2. Deploy `workers/digest` to Cloudflare Workers
expected: `wrangler deploy` succeeds from workers/digest/; worker appears in dashboard with cron trigger `0 6 * * 1`; DIGEST_QUEUE binding active; SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY secrets configured; `wrangler queues create owljobs-digest-dlq` run
result: [pending]

### 3. Weekly digest delivery (SC #1)
expected: A confirmed subscriber receives a weekly digest email at 06:00 UTC Monday with new matching jobs for their niche
result: [pending]

### 4. RFC 8058 GET unsubscribe — inbox click (SC #2)
expected: Clicking List-Unsubscribe link in Gmail/Outlook navigates to /api/unsubscribe?token=...; subscriber row has `confirmed_at = NULL` after GET
result: [pending]

### 5. RFC 8058 POST one-click unsubscribe (SC #2)
expected: Gmail/Outlook one-click unsubscribe triggers POST to /api/unsubscribe?token=...; returns 200 OK; subscriber `confirmed_at = NULL`
result: [pending]

### 6. Idempotency live replay (SC #3)
expected: Triggering digest worker twice for same Monday produces exactly 1 `email_sends` row per subscriber; second invocation catches 23505, sends 0 emails
result: [pending]

### 7. No HTTP fetch handler exposure (T-03-04)
expected: `curl` against deployed worker URL returns 405 or no response (no fetch handler exported)
result: [pending]

### 8. GDPR re-subscribe after soft-unsubscribe
expected: Unsubscribed user re-submits subscribe form → receives confirmation email → clicks confirm → `confirmed_at` repopulated in existing row (no duplicate row created)
result: [pending]

### 9. Zero-jobs week email rendering
expected: When no new jobs exist in past 7 days, digest still sends with no-new-listings message; email renders without errors
result: [pending]

### 10. SC #4 subscriber count gate (check before Phase 4)
expected: `SELECT COUNT(*) FROM wind_turbine.subscribers WHERE confirmed_at IS NOT NULL` returns ≥ 100 before Phase 5 entry. Note: this is an ops milestone, not a code gap — Phase 4 can proceed immediately.
result: [pending]

### 11. STATE.md CAND-04 Active Todos entry
expected: An entry for CAND-04 outreach milestone tracking added to Active Todos section of .planning/STATE.md (deferred from Plan 03-04 Task 3 worktree checkpoint)
result: [pending]

## Summary

total: 11
passed: 0
issues: 0
pending: 11
skipped: 0
blocked: 0

## Gaps
