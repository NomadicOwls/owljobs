---
phase: 01-production-foundation
plan: 04
subsystem: api
tags: [gdpr, resend, turnstile, astro, cloudflare-pages, multi-niche]

# Dependency graph
requires:
  - phase: 01-production-foundation/01-01
    provides: "stale job lifecycle, ingest worker patterns"
provides:
  - "sendDeletionRequest helper in lib/resend.ts — GDPR deletion email via Resend"
  - "/api/delete-request POST endpoint with Turnstile protection"
  - "Deletion form embedded at bottom of /privacy (prerendered, client-side fetch)"
affects:
  - "01-05: DNS/Resend domain verification (privacy@ mailbox must exist)"
  - "future: auto-deletion workflow if v2 replaces manual processing"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "sendDeletionRequest: extend private sendEmail wrapper pattern — same as sendConfirmation/sendUnsubscribeAck"
    - "Client-side fetch on prerendered Astro page — form posts JSON to /api/* route; getEnv fallback to import.meta.env for TURNSTILE_SITE_KEY"
    - "Source-contract vitest tests — readFile-based; assert template literals and absence of hardcoded values"
    - "Multi-niche recipient: privacy@${niche.domain} never hardcoded"

key-files:
  created:
    - apps/web/src/pages/api/delete-request.ts
    - apps/web/test/delete-request.test.ts
  modified:
    - apps/web/src/lib/resend.ts
    - apps/web/src/pages/privacy.astro

key-decisions:
  - "Recipient is passed as `to: privacy@${niche.domain}` from the API route — resend.ts helper is niche-agnostic"
  - "No auto-deletion — endpoint only sends notification email, manual processing per CONTEXT D-16"
  - "Turnstile verification before sendDeletionRequest — same validation order as subscribe.ts"
  - "Prerender constraint handled by client-side fetch; getEnv fallback covers build-time TURNSTILE_SITE_KEY"

patterns-established:
  - "Pattern: Extend lib/resend.ts with new exported helper for each email type — never re-implement sendEmail"
  - "Pattern: Source-contract tests (readFile + regex) for multi-niche correctness guarantees"

requirements-completed:
  - INFRA-08

# Metrics
duration: 25min
completed: 2026-05-09
---

# Phase 01 Plan 04: GDPR Deletion Request Summary

**GDPR Article 17 deletion flow via Resend: sendDeletionRequest helper, /api/delete-request POST endpoint with Turnstile, and embedded client-side form on prerendered /privacy page**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-09T23:19:00Z
- **Completed:** 2026-05-09T23:22:00Z
- **Tasks:** 3 (Task 2 had RED/GREEN TDD commits)
- **Files modified:** 4

## Accomplishments

- `sendDeletionRequest` exported from `lib/resend.ts`, delegates to private `sendEmail`, subject includes `[GDPR]` and `${opts.siteName}`
- `/api/delete-request` validates email regex + Turnstile, sends email to `privacy@${niche.domain}`, returns structured 200/400/500 responses
- Deletion form embedded at bottom of `/privacy.astro` (prerendered); client-side `fetch` posts JSON — compatible with `prerender=true`
- 8/8 source-contract vitest tests pass; Astro build produces `/privacy/index.html` with form HTML

## Task Commits

1. **Task 1: sendDeletionRequest helper** - `fd26ca9` (feat)
2. **Task 2 RED: failing source-contract tests** - `2369115` (test)
3. **Task 2 GREEN: /api/delete-request endpoint** - `2076677` (feat)
4. **Task 3: deletion form on /privacy** - `5574a03` (feat)

## Files Created/Modified

- `apps/web/src/lib/resend.ts` — new `sendDeletionRequest` export appended after `sendUnsubscribeAck`
- `apps/web/src/pages/api/delete-request.ts` — POST handler: email validation + Turnstile + sendDeletionRequest
- `apps/web/test/delete-request.test.ts` — 8 source-contract tests (multi-niche guard, validation messages, success message)
- `apps/web/src/pages/privacy.astro` — frontmatter gets `getEnv`/`TURNSTILE_SITE_KEY`; deletion form section + client script appended

## Decisions Made

- Recipient address constructed in the API route as `privacy@${niche.domain}` — `sendDeletionRequest` receives `to` as a parameter; stays niche-agnostic
- No confirmation email to requester per CONTEXT D-14 — only founder notification
- `is:inline` removed from Turnstile `<script src=...>` in final implementation — used `async defer` only (Astro strips `is:inline` from external src scripts anyway)

## Deviations from Plan

### Pre-existing Typecheck Error (Out of Scope)

The plan's acceptance criteria include "typecheck passes". `pnpm --filter @owljobs/web typecheck` exits 1 due to a pre-existing error in `apps/web/src/components/ui/Input.astro` (line 17: `Type 'string' is not assignable to type 'HTMLInputTypeAttribute'`). This error existed before any changes in this plan (verified by stash + rerun). Per scope boundary rules, this is out-of-scope and not fixed here.

**Deferred item:** Fix `Input.astro` HTMLInputTypeAttribute type error.

### Pre-existing Mailto Hardcode (Out of Scope)

`apps/web/src/pages/privacy.astro` line 87 contains a hardcoded `mailto:privacy@windturbinejobs.com` link in the body copy. This is pre-existing, not introduced by this plan, and outside Task 3's scope boundary. The multi-niche source-contract test for `delete-request.ts` guards the new code only.

**Deferred item:** Replace hardcoded mailto with dynamic `privacy@${niche.domain}` when privacy page becomes server-rendered or a niche-aware build step is added.

---

**Total deviations:** 0 auto-fixes. 2 out-of-scope items deferred (pre-existing typecheck error, pre-existing mailto hardcode).

## Issues Encountered

- `pnpm install` needed in worktree before first typecheck run (node_modules absent)
- Vitest at root level; test uses relative `readFile("apps/web/...")` path — runs correctly from repo root

## User Setup Required

Per plan frontmatter `user_setup`:
- **Resend**: `privacy@windturbinejobs.com` mailbox must exist and forward to founder (Cloudflare Email Routing or similar)
- **DNS**: Resend sending domain verification (Plan 05 covers this)
- No code changes needed — endpoint will send once the mailbox and Resend domain are live

## Threat Surface

No new surfaces beyond the plan's threat model (T-01-13 through T-01-17). Turnstile protection implemented per T-01-13. Multi-niche source-contract test enforces T-01-17.

## Next Phase Readiness

- INFRA-08 complete — deletion request flow is code-complete
- Plan 05 (DNS/Resend verification) must verify `privacy@windturbinejobs.com` mailbox before emails will land
- `/api/delete-request` endpoint is live in the next deploy

---
*Phase: 01-production-foundation*
*Completed: 2026-05-09*
