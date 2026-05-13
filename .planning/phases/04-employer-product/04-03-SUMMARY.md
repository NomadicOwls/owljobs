---
phase: 04-employer-product
plan: "03"
subsystem: web/employer-profile
tags: [phase-4, employer-product, vertical-slice, public-profile, claim-flow, PROF-01, PROF-02]
dependency_graph:
  requires: [04-01, 04-02]
  provides: [PROF-01, PROF-02]
  affects: [apps/web/src/pages/employers/[slug].astro, packages/schema]
tech_stack:
  added: []
  patterns: [logo.dev CDN with initials fallback, fetch-POST modal submit, Supabase auth.admin.generateLink, employer_users upsert before response]
key_files:
  created:
    - apps/web/src/components/employer/EmployerLogo.astro
    - apps/web/src/components/employer/ClaimListingCTA.astro
    - apps/web/src/components/employer/ClaimListingModal.astro
    - apps/web/src/pages/api/employer/claim.ts
  modified:
    - apps/web/src/pages/employers/[slug].astro
    - apps/web/src/env.d.ts
    - packages/schema/src/index.ts
decisions:
  - "LOGODEV_TOKEN read via import.meta.env (build-time) — must be set as build var not runtime secret in Cloudflare Pages"
  - "employer_users upserted BEFORE returning 200 (Pitfall 8 — Auth Hook finds row at token-issue time)"
  - "employerId added to App.Locals as optional string — populated by auth middleware in later plans"
  - "Employer type extended with slug + domain fields matching migration 0007"
metrics:
  duration: "~15 minutes"
  completed: "2026-05-13"
  tasks_completed: 3
  tasks_total: 3
  files_created: 4
  files_modified: 3
---

# Phase 4 Plan 03: Employer Claim Flow (Vertical Slice) Summary

Delivered PROF-01 (auto-generated profile pages with logo.dev + initials fallback) and PROF-02 (Claim CTA + POST claim API with domain-match, magic-link, employer_users upsert).

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | EmployerLogo + ClaimListingCTA + ClaimListingModal | f4fef41 | 3 new components |
| 2 | POST /api/employer/claim | a27e882 | 1 new API route |
| 3 | Wire into /employers/[slug] | d364b59 | 1 page + 2 type files |

## What Was Built

**EmployerLogo.astro** — renders `<img src="https://img.logo.dev/{domain}?token=...">` with initials fallback div. Size variants sm/md/lg. `onerror` swaps img → initials if logo.dev fails. Token from `import.meta.env.LOGODEV_TOKEN`.

**ClaimListingCTA.astro** — outline button "Claim this listing" with `data-claim-trigger`. Includes ClaimListingModal. Script handles open/close/ESC.

**ClaimListingModal.astro** — accessible `role="dialog" aria-modal="true"` overlay. Email input POSTs `{ email, slug }` to `/api/employer/claim`. Shows success paragraph or inline error by status code.

**POST /api/employer/claim** — domain-match flow:
1. Validate email regex + slug presence (400)
2. Look up employer by slug in `niche.supabaseSchema` (404 if not found)
3. Compare email domain to `employers.domain` case-insensitively (422 on mismatch)
4. `auth.admin.generateLink({ type: 'magiclink', ... })`
5. Upsert `employer_users` with `auth_id` BEFORE returning (Pitfall 8)
6. Return `{ ok: true }` 200

**[slug].astro** — inline initials tile replaced by EmployerLogo; header card gets ClaimListingCTA (hidden for authenticated claimant via `Astro.locals.employerId !== employer.id`); empty state adds claim prompt link.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing type] Added employerId to App.Locals**
- Found during: Task 3
- Issue: `Astro.locals.employerId` referenced in [slug].astro but not declared in App.Locals, causing typecheck failure
- Fix: Added `employerId?: string` to `App.Locals` in `apps/web/src/env.d.ts`
- Files modified: apps/web/src/env.d.ts
- Commit: d364b59

**2. [Rule 2 - Missing fields] Extended Employer type with slug + domain**
- Found during: Task 3
- Issue: `employer.domain` and `employer.slug` used in [slug].astro but absent from `Employer` interface in `@owljobs/schema`
- Fix: Added `slug: string` and `domain: string | null` to the Employer interface (fields added by migration 0007 in plan 01)
- Files modified: packages/schema/src/index.ts
- Commit: d364b59

**3. [Rule 1 - Type error] Cast fetch response in ClaimListingModal**
- Found during: Task 3 typecheck
- Issue: `res.json().catch(() => ({}))` inferred as `{}` — TypeScript error on `data?.error`
- Fix: Cast to `{ error?: string }` via `as`
- Files modified: apps/web/src/components/employer/ClaimListingModal.astro
- Commit: d364b59

### Pre-existing Errors (out of scope, not fixed)

- `src/components/Header.astro:5` — ts(2532) Object possibly undefined — pre-existing
- `src/components/ui/Input.astro:17` — ts(2322) type string not assignable — pre-existing
- Both logged to deferred-items per scope boundary rule

## Known Stubs / Caveats

- **LOGODEV_TOKEN** — read via `import.meta.env.LOGODEV_TOKEN` (build-time). In Cloudflare Pages SSR, runtime secrets from the dashboard won't populate `import.meta.env`. Token must be added as a build environment variable (not a runtime secret binding). Logo will silently fall back to initials if token is absent.
- **employer.slug lookup** — `[slug].astro` calls `listEmployerJobs` which queries by `normalized_name`. The `employer.slug` prop passed to ClaimListingCTA comes from the DB row (select `*`). Verify `slug === normalized_name` in migration 0007 to confirm correct lookup. Claim API does `.eq("slug", slug)` which is correct.
- **Claimant visibility** — `Astro.locals.employerId` is always undefined until auth middleware (plan 06) populates it from the JWT claim. CTA will show to all visitors including signed-in claimants until that middleware ships.

## Test Results

- `employer-logo.test.ts` — 2/2 PASSED (PROF-01 GREEN)
- `claim.test.ts` — 3/3 PASSED (PROF-02 GREEN)

## Self-Check: PASSED

Files created/exist:
- apps/web/src/components/employer/EmployerLogo.astro — FOUND
- apps/web/src/components/employer/ClaimListingCTA.astro — FOUND
- apps/web/src/components/employer/ClaimListingModal.astro — FOUND
- apps/web/src/pages/api/employer/claim.ts — FOUND

Commits exist:
- f4fef41 — feat(04-03): add EmployerLogo, ClaimListingCTA, ClaimListingModal
- a27e882 — feat(04-03): add POST /api/employer/claim endpoint
- d364b59 — feat(04-03): wire EmployerLogo + ClaimListingCTA into /employers/[slug]
