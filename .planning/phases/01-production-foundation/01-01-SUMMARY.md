---
phase: 01-production-foundation
plan: "01"
subsystem: ingest-worker
tags: [stale-jobs, google-indexing, migration, vitest, expire, data-lifecycle]
dependency_graph:
  requires: []
  provides: [migration-0004, expire-module, google-indexing-module, vitest-scaffold]
  affects: [workers/ingest, packages/schema, Plan-02-frontend-query]
tech_stack:
  added: [jose@6.2.3, vitest@4.1.5, "@vitest/coverage-v8@4.1.5"]
  patterns: [RS256-JWT-via-jose, expiry-diffing-Set, PING_BUDGET_PER_RUN-cap, 23505-reactivation]
key_files:
  created:
    - packages/schema/src/migrations/0004_stale_jobs_consent.sql
    - packages/schema/test/types.test.ts
    - workers/ingest/src/google-indexing.ts
    - workers/ingest/src/expire.ts
    - workers/ingest/test/expire.test.ts
    - workers/ingest/test/google-indexing.test.ts
    - workers/ingest/test/upsert.test.ts
    - vitest.config.ts
  modified:
    - packages/schema/src/index.ts
    - workers/ingest/src/ingest.ts
    - workers/ingest/src/index.ts
    - workers/ingest/wrangler.toml
    - package.json
    - workers/ingest/package.json
decisions:
  - "jobs.id stays as job.sourceId (not sha256(canonical_url)) to avoid regressing existing rows; fetchedJobIds accumulates sourceId to match DB PKs as actually stored"
  - "reporters:'basic' fails on vitest 4.1.5 — switched to reporters:'default' (Rule 3 fix)"
  - "RSA-2048 test keypair generated fresh via openssl rather than using the plan fixture (which could fail on some environments)"
  - "plan filter name @owljobs/ingest corrected to @owljobs/worker-ingest throughout (Rule 3 deviation)"
metrics:
  duration: "~25 minutes"
  completed: "2026-05-09"
  tasks_completed: 6
  files_modified: 14
  tests_added: 17
---

# Phase 1 Plan 01: Stale-Job Lifecycle + vitest Scaffold Summary

Stale-job detection (DATA-01) and Google Indexing API ping (DATA-03) fully implemented: migration 0004, TypeScript type extensions, expiry algorithm with multi-niche correctness and outage guard, RS256 JWT OAuth2 ping infrastructure, 23505 reactivation branch in upsertJob, and workspace-wide vitest setup.

## What Was Built

### Migration 0004 — Stale-Job Lifecycle + GDPR Consent

`packages/schema/src/migrations/0004_stale_jobs_consent.sql` adds:
- `wind_turbine.jobs.status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired'))` — stale-job lifecycle state
- `wind_turbine.jobs.expired_at TIMESTAMPTZ` — soft-delete detection timestamp; NULL while active
- `wind_turbine.subscribers.consent_given_at TIMESTAMPTZ` — GDPR Art 7 consent timestamp; backfilled from `created_at` for existing rows
- Two indexes: `idx_jobs_expired_at_cleanup` (partial on `status='expired'`) and `idx_jobs_status_active` (partial on `status='active'`)
- RLS policy `public_relevant_jobs` dropped and recreated with `status = 'active'` clause — anon SELECT cannot return expired rows

**Critical naming distinction:**
- `expires_at TIMESTAMPTZ` — EXISTS from migration 0001. Employer-stated closing date. UNTOUCHED.
- `expired_at TIMESTAMPTZ` — NEW from migration 0004. Our soft-delete detection timestamp, set by `expireMissingJobs()`.

### TypeScript Type Extensions

`packages/schema/src/index.ts` extended:
- `Job` interface: added `status: "active" | "expired"` and `expired_at: string | null`. Preserved `expires_at: string | null` unchanged.
- `Subscriber` interface: added `consent_given_at: string | null`

### expire.ts — DATA-01 Core Algorithm

`workers/ingest/src/expire.ts` exports:
- `expireMissingJobs(db, employerId, fetchedJobIds, saJson)` → `ExpireResult`
  - **CONTEXT D-01 outage guard**: returns zeros immediately if `fetchedJobIds.size === 0` — prevents mass-expiry from transient ATS outage
  - Diffs all active DB jobs for the employer against the fetched Set; marks absent ones as `status='expired', expired_at=NOW()`
  - Pings Google Indexing API for each expired job's `canonical_url`, subject to `PING_BUDGET_PER_RUN = 100` cap
  - Ping failures are non-fatal; accumulated into `pingFailures` counter
- `cleanupExpired(db)` → `number`
  - Hard-deletes rows where `status='expired' AND expired_at < NOW() - 90 days`
  - Idempotent; safe to call every cron run
- `ExpireResult` type: `{ marked, reactivated, pinged, pingFailures, pingsSkipped }`

### google-indexing.ts — RS256 JWT + OAuth2 + Indexing API

`workers/ingest/src/google-indexing.ts` exports:
- `pingUrlUpdated(saJson, url)` → `Promise<{ ok: boolean; status: number }>`
  - Parses service-account JSON; unescapes `\n` in `private_key` before `importPKCS8`
  - Signs RS256 JWT via `jose` (edge-only — no `node:crypto`)
  - Exchanges for OAuth2 token via `jwt-bearer` grant type
  - POSTs to `urlNotifications:publish` with `type: "URL_UPDATED"`
  - Throws `Error('token exchange failed: ${status} ${text}')` on non-2xx OAuth2 response
  - Returns `{ok, status}` for the publish call — caller decides whether to treat !ok as fatal

### ingest.ts Modifications

- Added `import { expireMissingJobs, type ExpireResult } from "./expire.js"`
- `IngestStats` extended with `expired`, `pinged`, `pingFailures` counters
- `ingestNiche` signature extended: `saJson?: string` passed to all 5 adapters
- All 5 adapters (`ingestWorkday`, `ingestGreenhouse`, `ingestSuccessFactors`, `ingestRecruitee`, `ingestSoftgarden`):
  - Added `saJson?: string` parameter
  - Accumulate `fetchedJobIds.add(job.sourceId)` per job in the loop
  - Call `expireMissingJobs(db, employerId, fetchedJobIds, saJson)` after loop; merge ExpireResult into stats
- `upsertJob` 23505 branch: reactivation UPDATE added before `return false`:
  ```typescript
  await db.from("jobs").update({ status: "active", expired_at: null })
    .eq("id", input.id).eq("status", "expired");
  ```
  The `.eq("status", "expired")` filter makes this a no-op for already-active rows.

### index.ts Modifications

- Added `import { cleanupExpired } from "./expire.js"`
- `Env` interface: added `GOOGLE_INDEXING_KEY?: string`
- `scheduled` handler: passes `env.GOOGLE_INDEXING_KEY` to `ingestNiche`; calls `cleanupExpired(db)` after each niche's ingest; logs new stat fields
- `/ingest-now` debug route: also passes `env.GOOGLE_INDEXING_KEY`

### vitest Scaffold

- `vitest.config.ts` at repo root picks up `apps/**/test/**/*.test.ts`, `workers/**/test/**/*.test.ts`, `packages/**/test/**/*.test.ts`
- Root `package.json`: `"test": "vitest run --bail=1 --passWithNoTests"`
- `vitest@^4.1.5` and `@vitest/coverage-v8@^4.1.5` as workspace root devDeps
- `jose@^6.2.3` as runtime dep on `@owljobs/worker-ingest`

## Test Results

17 tests across 4 test files — all passing:
- `packages/schema/test/types.test.ts` — 5 type-extension tests
- `workers/ingest/test/google-indexing.test.ts` — 3 tests (happy path, 403 quota, token error)
- `workers/ingest/test/expire.test.ts` — 8 tests (outage guard, expiry detection, budget cap, ping failures, cleanup)
- `workers/ingest/test/upsert.test.ts` — 1 source-contract test for 23505 reactivation

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Wrong package filter name in plan**
- **Found during:** Task 1 pre-check (reading workers/ingest/package.json)
- **Issue:** Plan specified `--filter @owljobs/ingest` but actual package name is `@owljobs/worker-ingest`
- **Fix:** Used `@owljobs/worker-ingest` throughout (Task 1 jose install, Task 5 typecheck verify)
- **Files modified:** None — command invocation fix only

**2. [Rule 3 - Blocking] vitest 4.1.5 does not support `reporters: "basic"`**
- **Found during:** Task 1 verification step
- **Issue:** `reporters: "basic"` causes a startup error ("Failed to load custom Reporter from basic") in vitest 4.x — `"basic"` is only a valid reporter in vitest 3.x
- **Fix:** Changed to `reporters: "default"` in `vitest.config.ts`; also added `passWithNoTests: true` directly in config
- **Files modified:** `vitest.config.ts`

**3. [Rule 2 - Quality] Broken type assertion in types.test.ts (advisor-flagged)**
- **Found during:** Task 2 test authoring (advisor pre-execution review)
- **Issue:** The plan's test fixture included `expectTypeOf<Job["expires_at"]>().not.toEqualTypeOf<Job["expired_at"]>` without call parens — the assertion was a no-op property access. Additionally, both types are `string | null` so `.not.toEqualTypeOf` would fail even with parens.
- **Fix:** Removed the broken expectTypeOf line; replaced with a runtime stub test that verifies both property names exist as distinct fields
- **Files modified:** `packages/schema/test/types.test.ts`

**4. [Rule 3 - Quality] Generated fresh RSA-2048 keypair for test fixture**
- **Found during:** Task 3 test authoring
- **Issue:** Plan's hardcoded PEM fixture had unknown provenance and could fail `importPKCS8` validation
- **Fix:** Generated fresh RSA-2048 PKCS8 keypair via `openssl genpkey` — known-valid, throwaway key
- **Files modified:** `workers/ingest/test/google-indexing.test.ts`

## Known Stubs

None — all implemented functionality is wired and complete.

## Threat Surface Scan

No new security surface beyond what's in the plan's threat model:
- T-01-01 (D-01 outage guard): implemented — `fetchedJobIds.size === 0` early return in `expireMissingJobs`
- T-01-02 (ping quota cap): implemented — `PING_BUDGET_PER_RUN = 100` constant
- T-01-03 (GOOGLE_INDEXING_KEY secret): documented in wrangler.toml comment; value never committed
- T-01-04 (RLS gap on status): implemented — `public_relevant_jobs` policy recreated with `status = 'active'`

## Production Notes

- Migration 0004 is NOT applied to production DB in this plan — that is a blocking task in Plan 05
- `GOOGLE_INDEXING_KEY` service-account JSON is NOT set as a secret in this plan — that is in Plan 05
- The `reactivated` field in `ExpireResult` is always 0 from `expireMissingJobs` — reactivation happens in `upsertJob`'s 23505 branch (ingest.ts), not in expire.ts

## Self-Check: PASSED

All created files verified present. All 6 task commits verified in git log.

| Item | Status |
|------|--------|
| `packages/schema/src/migrations/0004_stale_jobs_consent.sql` | FOUND |
| `workers/ingest/src/expire.ts` | FOUND |
| `workers/ingest/src/google-indexing.ts` | FOUND |
| `vitest.config.ts` | FOUND |
| `01-01-SUMMARY.md` | FOUND |
| commit `ad415a6` (Task 1 - vitest scaffold) | FOUND |
| commit `faaeb16` (Task 2 - migration + types) | FOUND |
| commit `802cf11` (Task 3 - google-indexing.ts) | FOUND |
| commit `3698db8` (Task 4 - expire.ts) | FOUND |
| commit `88ebe51` (Task 5 - wire ingest + index) | FOUND |
| commit `af54825` (Task 6 - wrangler.toml docs) | FOUND |
