---
plan: 04-01
phase: 04-employer-product
status: complete
started: 2026-05-13
completed: 2026-05-13
commits:
  - 18f82f6
  - e5f4aee
  - 3780276
---

# Plan 04-01: Schema Foundation + Test Stubs — COMPLETE

## What Was Built

Foundation wave for Phase 4 — all prerequisites for vertical slice plans 03–10.

### Task 1: Migration 0007
- `packages/schema/src/migrations/0007_employer_product.sql` — tables, index fix, Auth Hook
- Adds `domain TEXT` column to `wind_turbine.employers`
- Creates `public.employer_users` (auth_id nullable, employer_id TEXT, niche_id TEXT) — global auth join table
- Drops broken `idx_jobs_featured` (WHERE is_sponsored = TRUE) and recreates with `WHERE featured_until IS NOT NULL`
- `public.custom_access_token_hook(event JSONB)` — injects employer_id + employer_niche into JWT `app_metadata`
- No RLS policies (deferred to migration 0008 / plan 06 after JWT path verification)

### Task 2: Dependencies + Bindings + Env Types
- `@supabase/ssr ^0.10.0` installed in apps/web; supabase-js bumped to satisfy peer dep
- `apps/web/wrangler.toml` — `[[analytics_engine_datasets]] binding = "ANALYTICS" dataset = "owljobs_events"` + Phase 4 secrets comment block
- `apps/web/src/env.d.ts` — added `@cloudflare/workers-types` reference; extended `CloudflareEnv` with `CF_ACCOUNT_ID`, `CF_API_TOKEN`, `LOGODEV_TOKEN?`, `ANALYTICS`
- `apps/web/src/lib/env.ts` — mirrored same 4 fields; scalar fields fallback to `import.meta.env` in local dev; ANALYTICS is `undefined` in local dev (Cloudflare-only binding)

### Task 3: Vitest Config + Wave 0 Test Stubs (RED state)
- `apps/web/vitest.config.ts` — added `include: ["test/**/*.test.ts"]`
- `apps/web/test/employer-logo.test.ts` — PROF-01: EmployerLogo component assertions
- `apps/web/test/claim.test.ts` — PROF-02: claim API source-contract
- `apps/web/test/featured.test.ts` — FEAT-03 + T-04-11 IDOR: featured toggle API
- `apps/web/test/landing.test.ts` — SEO landing pages assertions
- `apps/web/test/jobs.test.ts` — extended with FEAT-01 listFeaturedJobs describe block
- `workers/digest/test/employer-alert.test.ts` — ANLYT-02: employer match alert pipeline

Wave 0 RED state confirmed: 9 test files, 14 failures (expected — source files don't exist yet).

## Self-Check: PASSED

### Acceptance Criteria

- [x] `packages/schema/src/migrations/0007_employer_product.sql` exists
- [x] Contains `ADD COLUMN IF NOT EXISTS domain TEXT`
- [x] Contains `employer_id TEXT NOT NULL` in employer_users
- [x] Contains `WHERE featured_until IS NOT NULL` (index fix)
- [x] Contains `custom_access_token_hook` function with correct grants/revokes
- [x] Does NOT contain `CREATE POLICY` (RLS deferred to plan 06)
- [x] `@supabase/ssr ^0.10.0` in apps/web/package.json
- [x] `[[analytics_engine_datasets]]` + `binding = "ANALYTICS"` in wrangler.toml
- [x] `CF_ACCOUNT_ID`, `CF_API_TOKEN`, `LOGODEV_TOKEN`, `ANALYTICS` in env.ts and env.d.ts
- [x] All 7 test stub files exist
- [x] `pnpm vitest run` exits non-zero (RED state — expected)

## Deviations

- **Worktree isolation failed**: Worktree was based on a stale commit (8ac1b41, missing planning docs and migrations 0004-0006). All tasks executed directly on `main` instead. Single-user project — no parallel merge conflicts possible. This is the expected fallback per the execute-phase workflow.
- **Typecheck has 2 pre-existing errors** in `JobCardModern.astro` (unused Badge import) and `Input.astro` (HTMLInputTypeAttribute type mismatch) — not caused by this plan's changes.

## Key Files Created/Modified

- `packages/schema/src/migrations/0007_employer_product.sql`
- `apps/web/wrangler.toml`
- `apps/web/src/env.d.ts`
- `apps/web/src/lib/env.ts`
- `apps/web/package.json` + `pnpm-lock.yaml`
- `apps/web/vitest.config.ts`
- `apps/web/test/employer-logo.test.ts`
- `apps/web/test/claim.test.ts`
- `apps/web/test/featured.test.ts`
- `apps/web/test/landing.test.ts`
- `apps/web/test/jobs.test.ts` (extended)
- `workers/digest/test/employer-alert.test.ts`
