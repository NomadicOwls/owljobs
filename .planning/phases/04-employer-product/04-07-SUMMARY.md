---
phase: 04-employer-product
plan: "07"
subsystem: auth
tags: [phase-4, employer-product, auth, supabase-ssr, middleware, magic-link]
dependency_graph:
  requires: ["04-01", "04-02", "04-06"]
  provides: ["session-injection", "magic-link-auth", "pkce-callback"]
  affects: ["04-08-dashboard", "04-04-featured-toggle", "04-09-stats"]
tech_stack:
  added: ["@supabase/ssr ^0.10.0 (createServerClient, parseCookieHeader, serializeCookieHeader)"]
  patterns: ["getAll/setAll cookie adapter", "PKCE code exchange", "manual Response for Set-Cookie on redirect", "shouldCreateUser: false gate"]
key_files:
  created:
    - apps/web/src/pages/login.astro
    - apps/web/src/pages/auth/callback.astro
    - apps/web/src/pages/auth/check-email.astro
    - apps/web/src/components/auth/MagicLinkForm.astro
    - apps/web/src/components/auth/CheckEmailNotice.astro
    - apps/web/src/pages/api/auth/magic-link.ts
  modified:
    - apps/web/src/lib/supabase.ts (added createSupabaseServerClient)
    - apps/web/src/middleware.ts (extended with session + employerId injection)
    - apps/web/src/env.d.ts (added session + employerId to App.Locals)
decisions:
  - "parseCookieHeader returns optional value — map to ensure value is always string for GetAllCookies type"
  - "Added session and employerId types to App.Locals in env.d.ts (plan noted them as existing but they were absent)"
  - "Pre-existing typecheck errors in Header.astro and Input.astro left unchanged (out of scope)"
metrics:
  duration: "~25 minutes"
  completed: "2026-05-13"
  task_count: 3
  file_count: 9
---

# Phase 4 Plan 7: Magic-Link Auth Foundation Summary

End-to-end magic-link auth foundation: createSupabaseServerClient with getAll/setAll adapter, middleware session injection, /login page, /api/auth/magic-link endpoint, /auth/callback PKCE exchange, and /auth/check-email confirmation page.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | createSupabaseServerClient + middleware | 9e09cc8 | supabase.ts, middleware.ts, env.d.ts |
| 2 | /login, MagicLinkForm, magic-link API | 400fdf4 | login.astro, MagicLinkForm.astro, magic-link.ts |
| 3 | /auth/callback, CheckEmailNotice, check-email | e8f4173 | callback.astro, CheckEmailNotice.astro, check-email.astro |

## Files Created/Modified

| File | Lines | Role |
|------|-------|------|
| apps/web/src/lib/supabase.ts | +42 | Added createSupabaseServerClient with getAll/setAll adapter |
| apps/web/src/middleware.ts | ~42 | Extended to populate session + employerId; propagates Set-Cookie |
| apps/web/src/env.d.ts | +2 | Added session? Session|null and employerId?: string|null to App.Locals |
| apps/web/src/pages/login.astro | 19 | /login page; redirects to /dashboard if already signed in |
| apps/web/src/components/auth/MagicLinkForm.astro | 79 | Email form with loading state; fetches /api/auth/magic-link |
| apps/web/src/pages/api/auth/magic-link.ts | 43 | POST endpoint; signInWithOtp with shouldCreateUser=false |
| apps/web/src/pages/auth/callback.astro | 32 | PKCE exchangeCodeForSession; manual Response for Set-Cookie propagation |
| apps/web/src/components/auth/CheckEmailNotice.astro | 36 | Mail SVG + email echo + 60-min expiry note + try-again link |
| apps/web/src/pages/auth/check-email.astro | 18 | Reflects submitted email; regex guard against XSS |

## Pitfall Checks

| Check | Result |
|-------|--------|
| No legacy cookie adapter (get/set/remove) | PASS — grep returns empty |
| No getSession() in callback.astro | PASS — grep returns empty |
| No hardcoded wind_turbine in new files | PASS — all use niche.domain / niche.name |
| shouldCreateUser: false in magic-link.ts | PASS |
| exchangeCodeForSession in callback | PASS |
| getAll/setAll in supabase.ts | PASS |
| pnpm typecheck (new files) | PASS — 0 new errors (2 pre-existing in Header.astro + Input.astro) |
| pnpm build | PASS — Complete! |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing type] Added session + employerId to App.Locals in env.d.ts**
- **Found during:** Task 1 — typecheck reported Property 'session' does not exist on type 'Locals'
- **Issue:** Plan stated env.d.ts "already declares session? Session | null and employerId? string | null" but actual env.d.ts only had employerId?: string (no null, no session)
- **Fix:** Added session?: import("@supabase/supabase-js").Session | null and changed employerId to string | null
- **Files modified:** apps/web/src/env.d.ts
- **Commit:** 9e09cc8

**2. [Rule 1 - Bug] Fixed parseCookieHeader return type mismatch**
- **Found during:** Task 1 — typecheck error: Type '{ name: string; value?: string }[]' not assignable to GetAllCookies (requires value: string, not optional)
- **Issue:** parseCookieHeader from @supabase/ssr returns value as optional string; GetAllCookies requires it as required string
- **Fix:** Map over result to coerce value to "" when undefined — `map((c) => ({ name: c.name, value: c.value ?? "" }))`
- **Files modified:** apps/web/src/lib/supabase.ts
- **Commit:** 9e09cc8

### Pre-existing Issues (Out of Scope)

- `src/components/Header.astro:5` — Object is possibly 'undefined' (ts2532) — pre-existing, not caused by this plan
- `src/components/ui/Input.astro:17` — Type 'string' not assignable to 'HTMLInputTypeAttribute' (ts2322) — pre-existing, not caused by this plan

Both logged; not fixed.

## Known Stubs

None — all functionality is wired. Note: end-to-end flow requires:
1. Plan 02's Auth Hook live in Supabase (confirmed by jwt-path-verification.md)
2. An existing employer_users row for the test email (from plan 03 claim flow)
3. /dashboard target page ships in plan 08

## Threat Surface Scan

No new network endpoints beyond what the plan's threat model covers:
- /api/auth/magic-link — covered by T-04-07 (shouldCreateUser: false gate)
- /auth/callback — covered by T-04-05 (PKCE replay) and T-04-04 (session fixation)
- /auth/check-email — covered by T-04-06 (XSS guard via regex)
- T-04-08 (open redirect) — mitigated: callback hardcodes target to /dashboard or /login?error=*

## Self-Check

Files exist:
- FOUND: apps/web/src/pages/login.astro
- FOUND: apps/web/src/pages/auth/callback.astro
- FOUND: apps/web/src/pages/auth/check-email.astro
- FOUND: apps/web/src/components/auth/MagicLinkForm.astro
- FOUND: apps/web/src/components/auth/CheckEmailNotice.astro
- FOUND: apps/web/src/pages/api/auth/magic-link.ts
- FOUND: apps/web/src/lib/supabase.ts (modified)
- FOUND: apps/web/src/middleware.ts (modified)
- FOUND: apps/web/src/env.d.ts (modified)

Commits exist:
- FOUND: 9e09cc8
- FOUND: 400fdf4
- FOUND: e8f4173

## Self-Check: PASSED
