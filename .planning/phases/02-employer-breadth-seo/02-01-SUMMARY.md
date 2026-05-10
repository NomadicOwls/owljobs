---
phase: 02-employer-breadth-seo
plan: 01
subsystem: schema, niche-config, test
tags: [migration, candidates-table, wave1-activation, source-contract-test]
dependency_graph:
  requires: []
  provides: [public.candidates DDL, wave1-contract-test]
  affects: [workers/discover (Plan 08), niches/wind-turbine.ts]
tech_stack:
  added: []
  patterns: [source-contract-test, CREATE-TABLE-IF-NOT-EXISTS idempotent migration]
key_files:
  created:
    - packages/schema/src/migrations/0005_candidates.sql
    - workers/ingest/test/wave1.test.ts
  modified: []
decisions:
  - Migration 0005 in public schema (no niche substitution token) — per D-02 in 02-CONTEXT.md
  - Wave 1 employers already active in worktree (no edit needed for Task 4)
  - Supabase db push deferred — CLI linked to wrong project (groepshuizen not owljobs)
metrics:
  duration: ~12 minutes
  completed_date: "2026-05-11"
---

# Phase 2 Plan 01: Wave 1 Foundation Summary

One-liner: Migration 0005 creates `public.candidates` table for Discovery Worker, and Wave 1 source-contract test asserts 6 employers active via existing adapters.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create migration 0005_candidates.sql | 2fbb806 | packages/schema/src/migrations/0005_candidates.sql |
| 2 | Apply migration to Supabase | (deferred — see below) | (no files) |
| 3 | Human verify checkpoint | (auto-approved, YOLO mode) | — |
| 4 | Activate Wave 1 employers | (no-op, already active) | niches/wind-turbine.ts |
| 5 | Create wave1.test.ts | 0a52db5 | workers/ingest/test/wave1.test.ts |

## Migration 0005

File: `packages/schema/src/migrations/0005_candidates.sql`

Table: `public.candidates` (global, not per-niche)

Columns: `id` (UUID PK), `name` (TEXT), `careers_url` (TEXT), `ats_type` (TEXT), `confidence` (FLOAT), `probed_at` (TIMESTAMPTZ), `status` (TEXT, CHECK pending/detected/unknown/error), `notes` (TEXT), `created_at` (TIMESTAMPTZ)

Index: `idx_candidates_status ON public.candidates(status, confidence DESC)`

## Wave 1 Activation

All 6 Wave 1 employers were already active in `niches/wind-turbine.ts` — no edit required. Task 4 was a verification-only no-op.

Active atsTargets (9 total):

| Employer | Adapter | Status |
|----------|---------|--------|
| GE Vernova | workday | Wave 0 |
| Vestas | successfactors | Wave 0 |
| NextEra Energy | successfactors | Wave 0 |
| Nordex | successfactors | Wave 1 |
| Blattner Energy | workday | Wave 1 |
| Invenergy | workday | Wave 1 |
| Avangrid Renewables | workday | Wave 1 |
| Global Wind Service | recruitee | Wave 1 |
| Deutsche Windtechnik | softgarden | Wave 1 |

Deferred (remain commented): Siemens Energy (D-11), Ørsted (D-21, Plan 07), Quanta Services (iCIMS adapter deferred)

## wave1.test.ts Results

9/9 tests pass:
- 6 employer presence tests (Wave 1 activation contract)
- 3 deferred-commented tests (Siemens, Ørsted, Quanta)

Run: `/Users/ralphvanslooten/Work/code/nomadic-owls/owljobs/node_modules/.bin/vitest run --config /dev/null workers/ingest/test/wave1.test.ts`

## TypeScript Status

`workers/ingest` typecheck: PASS (confirmed via `tsc --noEmit` from ingest package)

Pre-existing failure in `apps/web/src/components/ui/Input.astro` (type `string` not assignable to `HTMLInputTypeAttribute`) — unrelated to this plan, out of scope.

## Deviations from Plan

### Deferred — Supabase Migration Not Applied

**Task 2:** `supabase db push` failed — Supabase CLI is linked to project `groepshuizen` (ref: `jncwdvqxqgusfhafejab`), not the OwlJobs project.

**Required action for user:**
1. `supabase link --project-ref <owljobs-project-ref>`
2. `supabase db push` (from repo root)
   - If migration history mismatch: `supabase migration repair --status applied` for prior migrations, then push
   - Or: apply via SQL Editor by pasting `packages/schema/src/migrations/0005_candidates.sql` contents
3. Verify: Supabase Dashboard → Table Editor → public → candidates

**Impact:** Plan 08 (Discovery Worker) is blocked until `public.candidates` exists in production.

### Task 4: No-Op Verify

Wave 1 employers were already uncommented in `niches/wind-turbine.ts` at the worktree HEAD. No edit was required.

## Known Stubs

None — migration and test are complete artifacts.

## Threat Flags

None — no new network endpoints or auth paths introduced. The `public.candidates` table has no anon grants (per T-02-01); service-role only access from workers/discover.

## Self-Check: PASSED

- `packages/schema/src/migrations/0005_candidates.sql` — FOUND
- `workers/ingest/test/wave1.test.ts` — FOUND
- Commit `2fbb806` — migration file (1 file, 22 insertions)
- Commit `0a52db5` — wave1.test.ts (1 file, 49 insertions)
- 9/9 tests pass
