---
phase: 3
slug: candidate-activation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-11
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `workers/digest/vitest.config.ts` — Wave 0 gap |
| **Quick run command** | `pnpm --filter @owljobs/digest test` |
| **Full suite command** | `pnpm --filter @owljobs/digest test --run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @owljobs/digest test`
- **After every plan wave:** Run `pnpm --filter @owljobs/digest test --run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 3-??-01 | migration | 1 | CAND-03 | — | N/A | manual | `supabase db push` | ❌ W0 | ⬜ pending |
| 3-??-02 | digest worker | 1 | CAND-01 | — | nicheId validated against registry | unit | `pnpm --filter @owljobs/digest test -- digest.test.ts` | ❌ W0 | ⬜ pending |
| 3-??-03 | digest worker | 1 | CAND-02 | — | List-Unsubscribe headers present per-subscriber | unit | `pnpm --filter @owljobs/digest test -- digest.test.ts` | ❌ W0 | ⬜ pending |
| 3-??-04 | digest worker | 1 | CAND-03 | — | insert-before-send; 23505 caught → skip | unit | `pnpm --filter @owljobs/digest test -- idempotency.test.ts` | ❌ W0 | ⬜ pending |
| 3-??-05 | unsubscribe | 2 | CAND-02 | T-01 | same 200 response whether token found or not | unit | `pnpm --filter @owljobs/web test` | ❌ W0 | ⬜ pending |
| 3-??-06 | newsletter | 2 | CAND-04 | — | N/A | snapshot | `pnpm --filter @owljobs/web test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `workers/digest/vitest.config.ts` — framework config (copy from workers/ingest)
- [ ] `workers/digest/src/digest.test.ts` — stubs for CAND-01, CAND-02 (cron enqueue + header check)
- [ ] `workers/digest/src/idempotency.test.ts` — stubs for CAND-03 (mock Supabase 23505 unique violation)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Resend passes `List-Unsubscribe-Post` header verbatim | CAND-02 | Resend header passthrough not confirmed in unit test | Send a test digest email, inspect raw headers in email client |
| Migration 0006 applied in production Supabase | CAND-03 | Production DB — `supabase db push` must be run by operator | `supabase db push` then verify `\d wind_turbine.email_sends` shows new columns |
| `owljobs-digest` queue created in Cloudflare | CAND-01 | Infra ops task | `wrangler queues create owljobs-digest` |
| `digest@windturbinejobs.com` authorized in Resend | CAND-01, CAND-02 | Resend dashboard op | Verify sending domain in Resend dashboard |
| Weekly digest received in Gmail inbox at 06:00 UTC | CAND-01 | Live email delivery | Subscribe with test address, wait for Monday 06:00 UTC; check inbox + spam |
| One-click unsubscribe works in Gmail/Outlook | CAND-02 | Email client integration | Use Gmail unsubscribe button; verify `confirmed_at = NULL` in Supabase |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
