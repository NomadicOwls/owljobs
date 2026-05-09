---
phase: 01-production-foundation
plan: "03"
subsystem: web-frontend
tags: [gdpr, consent, newsletter, subscribe, infra-06]
dependency_graph:
  requires: ["01-01"]
  provides: ["INFRA-06"]
  affects: ["apps/web/src/components/Newsletter.astro", "apps/web/src/pages/api/subscribe.ts"]
tech_stack:
  added: []
  patterns: ["source-contract tests with vitest", "defense-in-depth: client guard + server enforcement", "consent_given_at ISO timestamp"]
key_files:
  created: ["apps/web/test/subscribe.test.ts"]
  modified: ["apps/web/src/components/Newsletter.astro", "apps/web/src/pages/api/subscribe.ts"]
decisions:
  - "Placed consent check AFTER turnstileToken presence check but BEFORE verifyTurnstile() call to avoid wasting Turnstile quota on consent-less submits"
  - "Test uses verifyTurnstile( (with parenthesis) to skip the import line and find the actual function call for ordering assertion"
  - "Multi-niche: label uses niche.name.toLowerCase() — rendered at SSR time, no hardcoded 'wind turbine'"
metrics:
  duration: "~10 minutes"
  completed: "2026-05-09"
  tasks_completed: 2
  files_modified: 3
---

# Phase 1 Plan 03: GDPR Consent Vertical Slice Summary

GDPR consent checkbox wired end-to-end: HTML form checkbox (SSR multi-niche label) + client-side guard + server-side enforcement returning 400 + DB write of `consent_given_at` ISO timestamp.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add consent checkbox to Newsletter.astro | 9092471 | apps/web/src/components/Newsletter.astro |
| 2 | Enforce consent server-side + write consent_given_at | 28f2c6c | apps/web/src/pages/api/subscribe.ts, apps/web/test/subscribe.test.ts |

## What Was Built

**Newsletter.astro (Task 1)**
- Required checkbox (`name="consent"`, `id="subscribe-consent"`, `required`) inserted between email row and error paragraph
- Label text: `I agree to receive {niche.name.toLowerCase()} job alerts by email. I can unsubscribe at any time. Read our Privacy Policy.`
- Privacy link: `href="/privacy"`
- Client-side guard: reads `[name="consent"]:checked`, short-circuits with `errorEl.textContent = "Please confirm you agree to receive job alerts."` if unchecked
- Fetch body updated: `JSON.stringify({ email, turnstileToken, consent: true })`

**subscribe.ts (Task 2)**
- Body type widened: `{ email?: string; turnstileToken?: string; consent?: boolean }`
- Consent check before `verifyTurnstile()` call: `if (!body.consent) return Response.json({ error: "Consent required." }, { status: 400 })`
- Upsert extended: `consent_given_at: new Date().toISOString()`

**subscribe.test.ts (Task 2 — TDD RED → GREEN)**
- 4 source-contract tests: body type, error text, consent_given_at write, ordering before Turnstile call
- All 4 pass against the modified subscribe.ts

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed indexOf ordering test to skip import statement**
- **Found during:** Task 2 GREEN phase
- **Issue:** Plan's test used `src.indexOf("verifyTurnstile")` which finds the ES import statement on line 3, not the actual function call. The consent check on line 30 has a higher index, so `consentIdx < verifyIdx` always failed.
- **Fix:** Changed search string to `"verifyTurnstile("` (with open parenthesis) which skips the import line and finds the actual call at line 34. Test intent preserved: consent check (line 30) is before call (line 34).
- **Files modified:** apps/web/test/subscribe.test.ts
- **Commit:** 28f2c6c

## Deferred Issues (Out of Scope)

**Pre-existing typecheck failure in apps/web/src/components/ui/Input.astro**
- Error: `ts(2322): Type 'string' is not assignable to type 'HTMLInputTypeAttribute | null | undefined'` at line 17
- Present on the base commit (a8bd744) before any changes in this plan
- Not caused by this plan's changes
- Logged for future fix — typecheck acceptance criterion was not achievable due to pre-existing error

## Known Stubs

None — all consent fields are wired to actual DB column (migration 0004 from Plan 01).

## Threat Flags

All T-01-10, T-01-11, T-01-12 mitigations from the plan's threat model are implemented:
- T-01-10: Server-side `if (!body.consent)` is authoritative; HTML `required` is UX only
- T-01-11: Subscribe upsert only proceeds when consent is truthy
- T-01-12: `consent_given_at` ISO timestamp written at subscribe time

## TDD Gate Compliance

- RED commit: `f18b390` (test(01-03): add failing source-contract tests)
- GREEN commit: `28f2c6c` (feat(01-03): enforce consent server-side)
- All 4 tests pass after GREEN.

## Self-Check: PASSED

- [x] apps/web/src/components/Newsletter.astro — modified (consent checkbox + guard + consent body)
- [x] apps/web/src/pages/api/subscribe.ts — modified (body type, consent check, consent_given_at)
- [x] apps/web/test/subscribe.test.ts — created (4 source-contract tests, all green)
- [x] Commit 9092471 — Newsletter.astro consent checkbox
- [x] Commit f18b390 — RED test gate
- [x] Commit 28f2c6c — GREEN implementation + fixed ordering test
