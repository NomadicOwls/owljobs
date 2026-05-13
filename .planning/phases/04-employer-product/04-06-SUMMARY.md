---
plan: 04-06
phase: 04-employer-product
status: complete
started: 2026-05-13
completed: 2026-05-13
commits:
  - 8de0db3
---

# Plan 04-06: RLS Migration — COMPLETE

## What Was Done

- Wrote `packages/schema/src/migrations/0008_employer_rls.sql` with JWT path substituted from jwt-path-verification.md
- Applied migration 0008 to remote Supabase (HTTP 201)
- Verified all policies live:
  - `public.employer_users`: `employer_users_self_read` (auth_id = auth.uid())
  - `wind_turbine.employers`: `employers_auth_read` (SELECT TO authenticated USING TRUE)
  - `wind_turbine.jobs`: `jobs_auth_read_public` (mirrors existing anon filter)
  - `wind_turbine.jobs`: `jobs_employer_read_own` (employer_id = JWT app_metadata claim)
  - `wind_turbine.jobs`: `jobs_employer_update_own` (featured_until toggle gated on employer_id)
- Pre-existing anon policies (`public_employers`, `public_relevant_jobs`) untouched
- RLS confirmed ENABLED on `public.employer_users`

## Self-Check: PASSED

- [x] Migration 0008 exists at `packages/schema/src/migrations/0008_employer_rls.sql`
- [x] No `<<JWT_EMPLOYER_ID>>` placeholder remaining in file
- [x] Migration applied to remote database (HTTP 201)
- [x] All 5 new policies verified via pg_policies query
- [x] employer_users RLS: ENABLED
- [x] Pre-existing anon policies preserved (public_employers, public_relevant_jobs)
- [x] No UPDATE policy for employer profile (Phase 4 D-06: editing locked)
