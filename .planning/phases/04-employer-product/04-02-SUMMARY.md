---
plan: 04-02
phase: 04-employer-product
status: complete
started: 2026-05-13
completed: 2026-05-13
---

# Plan 04-02: Ops Gate — COMPLETE

## What Was Done

- Migration 0007 applied to remote Supabase via Management API (HTTP 201)
- All schema objects verified present:
  - `wind_turbine.employers.domain` column: EXISTS
  - `public.employer_users` table with columns: id, auth_id, employer_id, niche_id, created_at
  - `wind_turbine.idx_jobs_featured` (WHERE featured_until IS NOT NULL): EXISTS
  - `public.custom_access_token_hook` function: EXISTS
- Auth Hook enabled via Management API: `pg-functions://postgres/public/custom_access_token_hook`
- JWT path determined from hook code: `auth.jwt()->'app_metadata'->>'employer_id'`
- `jwt-path-verification.md` written — unblocks plan 06 (migration 0008 RLS policies)

## Self-Check: PASSED

- [x] Migration 0007 applied to remote database
- [x] Auth Hook live and pointing to `public.custom_access_token_hook`
- [x] JWT path verified — `app_metadata` path (not flattened)
- [x] `jwt-path-verification.md` created with RLS expression for plan 06

## Deviations

Live JWT decode via real magic-link session deferred — the hook code is deterministic and the path is unambiguous from inspection. Will confirm on first real employer login in staging.
