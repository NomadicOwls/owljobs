---
phase: 03-candidate-activation
plan: 01
subsystem: database
tags: [migration, vitest, idempotency, multi-niche, email-digest, postgres, supabase, source-contract]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: "wind_turbine.email_sends base table (0001_initial.sql) + RLS (0002_rls.sql) + subscribers multi-niche schema (0003_subscribers_multi_niche.sql)"
  - phase: 01-foundation
    provides: "stale_jobs_consent migration convention (0004) — header style, «wind_turbine» placeholder, ALTER TABLE pattern"
  - phase: 01-foundation
    provides: "Root vitest.config.ts auto-discovery of workers/**/test/**/*.test.ts"
  - phase: 02-employer-breadth
    provides: "Source-contract test pattern (workers/discover/test/probe.test.ts) — readFile + regex assertions"
provides:
  - "Migration 0006 — wind_turbine.email_sends.sent_date + type columns + UNIQUE (subscriber_id, sent_date, type) constraint"
  - "RED source-contract test suite (18 assertions) locking Plan 02's digest worker source contract"
  - "Idempotency gate primitive: email_sends_subscriber_date_type_key for insert-before-send pattern (D-16)"
affects: ["03-02 (digest worker — must satisfy these tests)", "03-03", "03-04", "future niche provisioning"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Source-contract testing (readFile + regex on source string) — no runtime mocking, asserts code shape Plan 02 must produce"
    - "Insert-before-send idempotency primitive (DB UNIQUE constraint at trust boundary; Worker catches 23505)"
    - "«wind_turbine» placeholder convention extended to migration 0006 — multi-niche provisioning preserved"

key-files:
  created:
    - "packages/schema/src/migrations/0006_email_sends_idempotency.sql"
    - "workers/digest/test/digest.test.ts"
    - "workers/digest/test/idempotency.test.ts"
  modified: []

key-decisions:
  - "Constraint name fixed as email_sends_subscriber_date_type_key (referenced by name in T-03-02 mitigation)"
  - "sent_date is DATE (UTC, CURRENT_DATE default) — Worker MUST compute via toISOString().slice(0,10) to match (Pitfall 4)"
  - "type column defaults to 'digest' — leaves room for future email types (welcome, alert) without schema change"
  - "No per-worker vitest.config.ts created — root config auto-discovers workers/**/test/**/*.test.ts"
  - "Tests are intentionally RED — ENOENT on workers/digest/src/index.ts is the documented signal Plan 02 closes them"

patterns-established:
  - "Pattern 1: Source-contract tests as Plan-to-Plan handoff — Plan 01 writes failing tests, Plan 02 makes them pass. The test file IS the spec."
  - "Pattern 2: DB-level idempotency primitives over application-level locks — UNIQUE constraint + 23505 catch (no Redis, no in-memory dedup)"
  - "Pattern 3: Comment-strip regex pre-processing in source contracts — `src.replace(/^\\s*\\/\\/.*$/gm, '').replace(/\\/\\*[\\s\\S]*?\\*\\//g, '')` to avoid matching documentation prose"

requirements-completed: []  # CAND-03 schema landed; full requirement closes only after Task 3 operator-applied to production AND Plan 02 ships the consuming code

# Metrics
duration: ~10 min (Tasks 1-2 + verification; Task 3 awaiting operator)
completed: 2026-05-12
---

# Phase 3 Plan 01: Foundation — Migration 0006 + Digest Source-Contract Tests Summary

**Migration 0006 lands email_sends idempotency schema (sent_date DATE + type TEXT + UNIQUE constraint email_sends_subscriber_date_type_key) and 18 RED source-contract assertions lock the workers/digest source shape Plan 02 must produce.**

## Performance

- **Duration:** ~10 min (Tasks 1-2 complete; Task 3 = operator gate)
- **Started:** 2026-05-12T10:31Z
- **Completed (Tasks 1-2):** 2026-05-12T10:34Z
- **Tasks completed:** 2 of 3 (Task 3 = blocking operator checkpoint)
- **Files created:** 3
- **Files modified:** 0

## Accomplishments

- Migration 0006 written following 0004 convention exactly: header block, «wind_turbine» placeholder, ALTER TABLE statements (column adds + named UNIQUE constraint)
- Two source-contract test files scaffolded under `workers/digest/test/` covering CAND-01 (cron+queue+Resend), CAND-02 (RFC 8058 List-Unsubscribe headers), and CAND-03 (insert-before-send idempotency, sent_date payload, 23505 catch/skip, niche-scoped schema)
- pnpm dependencies installed in worktree (511 packages); `pnpm test --run workers/digest/test` confirmed RED with documented ENOENT on `workers/digest/src/index.ts`
- 18 assertions total (14 in digest.test.ts, 4 in idempotency.test.ts) — every assertion failing on the missing source file, exactly the intended TDD handoff state

## Task Commits

1. **Task 1: Create migration 0006_email_sends_idempotency.sql** — `c4a112e` (feat)
2. **Task 2: Scaffold failing source-contract tests for workers/digest** — `83a94b7` (test)
3. **Task 3: [BLOCKING] Apply migration 0006 to production Supabase** — PENDING OPERATOR (checkpoint:human-action)

**Plan metadata:** _to be added by orchestrator after operator confirms Task 3 and worktree merges_

## Files Created/Modified

- `packages/schema/src/migrations/0006_email_sends_idempotency.sql` — Adds `sent_date DATE NOT NULL DEFAULT CURRENT_DATE`, `type TEXT NOT NULL DEFAULT 'digest'`, and `UNIQUE (subscriber_id, sent_date, type)` constraint named `email_sends_subscriber_date_type_key` on `wind_turbine.email_sends`. Preserves «wind_turbine» placeholder for multi-niche substitution.
- `workers/digest/test/digest.test.ts` — 14 source-contract assertions: scheduled+queue handler shape, getAllNiches multi-niche iteration, registry validation in consumer, confirmed_at NOT NULL filter (Pitfall 2), ctx.waitUntil, DIGEST_QUEUE.send payload shape, 7-day window + 20 job cap, UTC sent_date computation, Resend batch endpoint, From-address, List-Unsubscribe + List-Unsubscribe-Post: One-Click headers (RFC 8058), no fetch handler, logged-and-skipped error path.
- `workers/digest/test/idempotency.test.ts` — 4 source-contract assertions: email_sends insert ordered BEFORE Resend batch call (insert-before-send), sent_date + type='digest' payload, 23505 caught with continue/return (no throw), niche-scoped schema (no hardcoded wind_turbine string).

## Decisions Made

- **Migration scope kept minimal.** D-16 specifies columns + constraint only — no RLS edits, no index (UNIQUE auto-creates a btree). Resisted scope creep to add `INDEX ... WHERE type='digest'`; the unique-index covers the relevant query.
- **Source-contract pattern over runtime mocks.** Following the existing convention in `workers/discover/test/probe.test.ts` and `apps/web/test/subscribe.test.ts`, asserts on source string shape via regex. No `vi.mock`, no DB stand-up — the test file *is* Plan 02's spec.
- **Comment-stripping regex pre-process** in two assertions (no-fetch-handler, 23505+continue) — header prose may legitimately reference `fetch` or `23505`. Stripping `//` and `/* */` blocks before matching avoids false positives.
- **No per-worker vitest.config.ts.** Verified via `find workers/ -name "vitest.config*"` (empty) and confirmed root `vitest.config.ts` covers `workers/**/test/**/*.test.ts`. Adding a per-worker config would have shadowed the root config silently.
- **type column default 'digest' instead of NOT NULL without default.** Defaulting allows existing pre-Plan-02 rows (jobs_count only) to satisfy the new NOT NULL; the default also matches what Plan 02's insert will set explicitly.

## Deviations from Plan

None — plan executed exactly as written. The plan author specified exact file contents for both Task 1 (the SQL) and Task 2 (the two test files); I copied them verbatim. Verification commands all passed first run.

## Issues Encountered

- **pnpm node_modules missing in fresh worktree.** First `pnpm test` invocation returned `sh: vitest: command not found`. Resolution: ran `pnpm install --prefer-offline` (20.6s, 511 packages reused from store). Not a deviation from the plan — worktrees start clean; install is normal setup. `pnpm-lock.yaml` showed pre-existing modification at session start (unrelated to this plan) and was deliberately NOT staged.

## Threat Surface Scan

No new threat surface beyond what plan's `<threat_model>` already covers (T-03-01 migration tampering — `accept`; T-03-02 queue retry storm via constraint name — `mitigate`, deferred to Plan 02 source via `idempotency.test.ts` assertion on 23505 + continue). The migration introduces a DB constraint at an existing trust boundary (operator → Supabase); the tests introduce no runtime surface.

## Known Stubs

None. Both test files are intentionally RED via missing source file (`workers/digest/src/index.ts`) — this is the documented Plan 01→02 handoff, not a stub. Plan 02 closes the contract.

## User Setup Required

**External services require manual configuration.** Task 3 is a `checkpoint:human-action` gate that the orchestrator must surface to the operator:

- **Service:** Supabase (production project: `windturbinejobs`)
- **Why:** Apply migration 0006 to production `wind_turbine.email_sends`. Plan 02 (digest worker) cannot ship until the columns + constraint exist in production — the worker writes `sent_date` and `type='digest'` and catches `23505` on the named constraint.
- **Env vars (operator-side):** `SUPABASE_ACCESS_TOKEN` from Supabase Dashboard → Account → Access Tokens (already present per RUNBOOK.md)
- **Action (from repo root):**
  ```bash
  export SUPABASE_ACCESS_TOKEN=$(cat ~/.supabase/access_token 2>/dev/null || echo "")
  supabase db push
  ```
  Or via Supabase Dashboard SQL Editor: paste `packages/schema/src/migrations/0006_email_sends_idempotency.sql` with `«wind_turbine»` substituted to `wind_turbine` and execute.
- **Verification queries** (operator pastes outputs into resume signal):
  ```sql
  -- Column check
  SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
   WHERE table_schema = 'wind_turbine' AND table_name = 'email_sends'
   ORDER BY ordinal_position;
  -- Expected: id, subscriber_id, sent_at, jobs_count, sent_date (DATE, NOT NULL, CURRENT_DATE), type (TEXT, NOT NULL, 'digest')

  -- Constraint check
  SELECT conname
    FROM pg_constraint
   WHERE conrelid = 'wind_turbine.email_sends'::regclass
     AND contype  = 'u';
  -- Expected row: email_sends_subscriber_date_type_key
  ```
- **Resume signal:** Type `applied` and paste the two query outputs, or describe the failure.

## Next Phase Readiness

- **Migration file landed** and ready for `supabase db push` (operator-gated, blocking).
- **Source contract locked.** Plan 02 (workers/digest worker) has 18 grep-verifiable assertions defining exactly what `workers/digest/src/index.ts` must contain — scheduled/queue handler shape, all RFC 8058 + multi-niche + idempotency requirements.
- **Plan 02 acceptance criterion:** `pnpm test --run workers/digest/test` exits 0 (all 18 assertions GREEN).
- **Hard gate for Plan 02:** Task 3 must complete first — Plan 02's runtime inserts will fail without the production columns/constraint.

## Self-Check

File existence verification (each command returned EXISTS / FOUND):

```
packages/schema/src/migrations/0006_email_sends_idempotency.sql — FOUND
workers/digest/test/digest.test.ts                                — FOUND
workers/digest/test/idempotency.test.ts                           — FOUND
git log: c4a112e (Task 1)                                          — FOUND
git log: 83a94b7 (Task 2)                                          — FOUND
pnpm test workers/digest/test → ENOENT on workers/digest/src/index.ts — CONFIRMED RED (intentional)
```

## Self-Check: PASSED

All Task 1 and Task 2 deliverables present, committed, and verified. Task 3 remains as planned operator checkpoint (blocking, not a self-check failure).

---
*Phase: 03-candidate-activation*
*Plan: 01*
*Completed (Tasks 1-2): 2026-05-12*
*Task 3 gate: pending operator `supabase db push`*
