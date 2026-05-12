---
phase: 03-candidate-activation
plan: 03
subsystem: astro-api
tags: [astro-api, rfc-8058, unsubscribe, soft-delete, security, cand-02]

# Dependency graph
requires:
  - phase: 03-candidate-activation
    plan: 01
    provides: Digest worker emits List-Unsubscribe-Post header pointing at /api/unsubscribe
  - phase: 01-foundation
    provides: wind_turbine.subscribers table with unsubscribe_token UNIQUE column + email_sends FK
provides:
  - GET /api/unsubscribe (email-link flow) — soft-unsubscribe via .update({ confirmed_at: null })
  - POST /api/unsubscribe (RFC 8058 one-click) — soft-unsubscribe; token in URL; 200 OK unconditional
  - Source-contract test asserting both handlers soft-delete and never hard-delete
  - FK integrity guarantee from email_sends.subscriber_id across unsubscribe events
  - Clean re-subscribe UX (row preserved, only confirmed_at flips)
affects: [digest email deliverability, CAN-SPAM/GDPR compliance posture, re-subscribe flow]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Source-contract tests via readFile on .ts source (style adopted from subscribe.test.ts INFRA-06 pattern)"
    - "Soft-unsubscribe pattern: set confirmed_at = NULL instead of DELETE to preserve FK integrity from email_sends and enable clean re-subscribe"
    - "RFC 8058 one-click: token in url.searchParams (never POST body); response is unconditional 200 OK to prevent subscriber enumeration"

key-files:
  created:
    - apps/web/test/unsubscribe.test.ts
  modified:
    - apps/web/src/pages/api/unsubscribe.ts

key-decisions:
  - "Modify the existing /api/unsubscribe handlers in place — do NOT create a separate /api/unsubscribe-oneclick route (RESEARCH Conflict 2; planner mistake in D-19 corrected)"
  - "Migrate the GET handler to soft-delete as well (not just POST per D-20) — eliminates GET/POST asymmetry, preserves FK integrity uniformly, no downside (RESEARCH Conflict 4)"
  - "Token stays in url.searchParams for both GET and POST per RFC 8058 §3.1; POST body is literally `List-Unsubscribe=One-Click` and is ignored (RESEARCH Conflict 3; planner mistake in D-19 corrected)"
  - "POST returns the same 200 OK regardless of token match — no row-not-found branch — to mitigate subscriber enumeration via response side-channel (T-03-01)"

patterns-established:
  - "RFC 8058 soft-unsubscribe: GET and POST handlers in apps/web/src/pages/api/unsubscribe.ts both `.update({ confirmed_at: null }).eq('unsubscribe_token', token)`; POST returns 200 OK unconditionally"
  - "Source-contract test pattern reused (readFile + regex assertions) — same shape as subscribe.test.ts; lives in apps/web/test/unsubscribe.test.ts"

requirements-completed: [CAND-02]
requirements-partial: []

# Metrics
duration: 3min
completed: 2026-05-12
---

# Phase 3 Plan 3: CAND-02 RFC 8058 Soft-Unsubscribe Summary

**Migrated both GET and POST `/api/unsubscribe` handlers from hard-delete to `.update({ confirmed_at: null })` — preserves email_sends FK integrity, enables clean re-subscribe, and closes the loop on the digest email's RFC 8058 List-Unsubscribe-Post header set by Plan 03-01.**

## Performance

- **Duration:** ~3 min (incl. cold pnpm install: ~21s)
- **Started:** 2026-05-12T02:50:43Z
- **Completed:** 2026-05-12T02:54:00Z
- **Tasks:** 2 of 2 complete (fully autonomous, no checkpoints)
- **Files modified:** 2 (1 created, 1 edited)

## Accomplishments

- Both `/api/unsubscribe` handlers now soft-delete via `.update({ confirmed_at: null })` in `wind_turbine.subscribers` (niche-scoped schema preserved).
- RFC 8058 mechanics preserved verbatim: token in `url.searchParams.get("token")` for both handlers; POST returns unconditional `new Response("OK", { status: 200 })` with no row-not-found branch (T-03-01 enumeration mitigation).
- FK integrity from `email_sends.subscriber_id` is now safe across unsubscribe events — historical email-send records no longer orphan.
- Re-subscribe UX is now non-destructive: a previously-unsubscribed user can re-confirm without re-entering email + locations (row is preserved with `confirmed_at = NULL`).
- 8-assertion source-contract test in `apps/web/test/unsubscribe.test.ts` locks in the contract (exports, soft-delete, no hard-delete, token-in-URL, 200-OK unconditional POST, no `/unsubscribe-oneclick` route, niche-scoped schema).
- TDD cycle clean: RED commit (`test()`) → GREEN commit (`fix()`) → no refactor needed. Both Plan-level TDD gates satisfied.
- TypeScript clean: `cd apps/web && pnpm exec tsc --noEmit` exits 0.

## Task Commits

Each task committed atomically per TDD gate sequence:

1. **Task 1: Source-contract test for soft-delete unsubscribe (RED)** — `704775d` (`test(03-03)`)
2. **Task 2: Modify both unsubscribe handlers to soft-delete (GREEN)** — `152fc86` (`fix(03-03)`)

**Plan metadata commit:** SUMMARY.md committed as part of the worktree's final docs commit (orchestrator merges to main).

## Files Created/Modified

| File                                              | Type     | Purpose                                                                                                                                                                                                                                                |
| ------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/test/unsubscribe.test.ts`               | created  | 8-assertion source-contract test: exports GET+POST, both call `.update({ confirmed_at: null })`, no `.delete()` calls (comments stripped before check), token in `url.searchParams`, POST returns 200 OK unconditionally, no `unsubscribe-oneclick`, niche-scoped schema. |
| `apps/web/src/pages/api/unsubscribe.ts`           | modified | Both `.delete()` calls swapped to `.update({ confirmed_at: null })`. Inline comments document the RESEARCH Conflict 4 rationale (GET) and the RFC 8058 §3.1 + T-03-01 rationale (POST). No imports changed, no signatures changed, no new routes added.        |

## Key Decisions Made

- **D-1 (carried from planner; corrects D-19):** Modify in place — `apps/web/src/pages/api/unsubscribe.ts` already exports both GET and POST. No new file, no rename, no new route. (RESEARCH Conflict 2.)
- **D-2 (carried from planner; corrects D-19):** Token stays in `url.searchParams` for both handlers per RFC 8058 §3.1. The POST body is literally `List-Unsubscribe=One-Click` and is ignored — never read with `request.text()` / `request.formData()`. (RESEARCH Conflict 3.)
- **D-3 (extension of D-20):** Migrate the GET handler to soft-delete in addition to POST. Eliminates GET/POST asymmetry, applies the same FK-integrity + re-subscribe-UX benefit to the email-link flow. (RESEARCH Conflict 4.)
- **D-4 (enumeration mitigation, T-03-01):** POST returns unconditional `new Response("OK", { status: 200 })` — no `if (!data) return 404` branch. Token validity is not observable via response.

## Deviations from Plan

None — plan executed exactly as written.

## Authentication Gates

None.

## STRIDE Threat Register Status

| Threat ID   | Mitigation Verified                                                                                                                                                                                                              |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-03-01     | POST handler unconditionally returns `new Response("OK", { status: 200 })` after the `.update()` call — no branch on row match. Locked in by test assertion "POST returns 200 OK regardless of token match — no enumeration side-channel". |
| T-03-02     | Token read from `url.searchParams.get("token")` in both handlers; POST body never parsed. Locked in by test assertion "reads token from url.searchParams in both handlers".                                                       |
| T-03-03     | Existing `if (!token) return new Response("Missing token.", { status: 400 })` early-return preserved in both handlers (verified by re-reading source).                                                                            |
| T-03-04     | Accepted — `unsubscribe_token` is opaque UUID with UNIQUE index; acceptable for ASVS L1 unsubscribe action per planner risk register.                                                                                              |

No high-severity threats remain unmitigated.

## Threat Flags

None — this plan introduces no new network surface, auth path, file-access pattern, or schema change. It tightens existing behavior on an existing endpoint.

## Known Stubs

None — both handlers now operate against real `wind_turbine.subscribers` rows; no placeholder data, no TODOs added.

## TDD Gate Compliance

- **RED gate:** `704775d` — `test(03-03): add failing source-contract test for soft-delete unsubscribe`. Vitest run confirmed RED (1 of 8 assertions failed on `.update({ confirmed_at: null })` count; bail-1 mode stopped execution after the first failure as expected).
- **GREEN gate:** `152fc86` — `fix(03-03): migrate both unsubscribe handlers to soft-delete`. Vitest run confirmed all 8 assertions GREEN; `tsc --noEmit` exits 0.
- **REFACTOR gate:** Skipped (intentionally) — the GREEN edit is already minimal: 2 method-call swaps and 4 lines of explanatory comments. No clean-up needed.

## Self-Check: PASSED

- `apps/web/test/unsubscribe.test.ts` — FOUND
- `apps/web/src/pages/api/unsubscribe.ts` — FOUND (modified)
- Commit `704775d` (Task 1) — FOUND in `git log --oneline -5`
- Commit `152fc86` (Task 2) — FOUND in `git log --oneline -5`
- `grep -c '\.update({ confirmed_at: null })' apps/web/src/pages/api/unsubscribe.ts` returns 2 ✓
- `grep -E '^\s*[^/]*\.delete\(\)' apps/web/src/pages/api/unsubscribe.ts` returns no matches ✓
- `grep -c 'url\.searchParams\.get("token")' apps/web/src/pages/api/unsubscribe.ts` returns 2 ✓
- `pnpm test --run apps/web/test/unsubscribe.test.ts` exits 0 with 8/8 GREEN ✓
- `cd apps/web && pnpm exec tsc --noEmit` exits 0 ✓
