---
phase: 02-employer-breadth-seo
plan: 11
subsystem: workers/ingest
tags: [security, auth, cr-01, tdd]
dependency_graph:
  requires: []
  provides: [ingest-debug-auth]
  affects: [workers/ingest/src/index.ts, workers/ingest/wrangler.toml]
tech_stack:
  added: []
  patterns: [bearer-token-auth, source-contract-testing]
key_files:
  created:
    - workers/ingest/test/auth-guard.test.ts
  modified:
    - workers/ingest/src/index.ts
    - workers/ingest/wrangler.toml
decisions:
  - INGEST_SECRET declared required (no ?) to prevent Bearer-undefined bypass matching DISCOVER_SECRET pattern
  - Auth guard added inside each debug branch (not at fetch() top) to keep /jobs.json public
  - wrangler.toml uses comment-only convention (no [secrets] TOML section — follows existing pattern)
metrics:
  duration: 10m
  completed: 2026-05-11
---

# Phase 02 Plan 11: Debug Endpoint Auth Guard (CR-01) Summary

Bearer token auth added to the 4 unauthenticated debug endpoints in workers/ingest, closing CR-01 before production deployment.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Write auth-guard.test.ts (RED) | 11636e2 | workers/ingest/test/auth-guard.test.ts |
| 2 | Add INGEST_SECRET auth guard (GREEN) | 4ba7afa | workers/ingest/src/index.ts, workers/ingest/wrangler.toml |

## What Was Done

- `workers/ingest/src/index.ts`: Added `INGEST_SECRET: string` (required) to Env interface; added `Authorization: Bearer ${env.INGEST_SECRET}` check as first statement in each of `/classify-now`, `/ingest-now`, `/reclassify-ambiguous`, `/enrich-now` branches; returns HTTP 401 on missing or wrong token
- `workers/ingest/wrangler.toml`: Added comment block documenting `wrangler secret put INGEST_SECRET --name owljobs-ingest` (follows same convention as other secrets in the file)
- `workers/ingest/test/auth-guard.test.ts`: 8-test source-contract test suite asserting all auth requirements hold; all pass GREEN

## CR-01 Closure

All 4 debug endpoints now require `Authorization: Bearer <INGEST_SECRET>`. The `/jobs.json` production endpoint is unaffected (public). `scheduled()` and `queue()` handlers are unaffected (internal Cloudflare triggers, not HTTP).

## Operator Note

Before deploying workers/ingest to production, run:
```
wrangler secret put INGEST_SECRET --name owljobs-ingest
```
Generate a random value: `openssl rand -hex 32`. For local dev, add `INGEST_SECRET=<value>` to `workers/ingest/.dev.vars`.

This is also covered in Plan 02-12 (production deployment runbook).

## Deviations from Plan

**Plan self-contradiction resolved:** The plan's `<success_criteria>` block (line 361) incorrectly stated `INGEST_SECRET?: string` (optional). The `<behavior>` block, the test assertions, and the rationale all require the field to be required (no `?`). Implementation follows the correct requirement — required field — which the tests enforce.

## Known Stubs

None.

## Threat Surface Scan

No new trust boundaries introduced beyond what the plan's threat model covers. The auth guard closes T-02-gap11-01.

## Self-Check: PASSED

- workers/ingest/test/auth-guard.test.ts: FOUND
- workers/ingest/src/index.ts: FOUND (INGEST_SECRET count: 5 — 1 Env + 4 endpoints)
- workers/ingest/wrangler.toml: FOUND (INGEST_SECRET in comment block)
- Commits 11636e2 and 4ba7afa: confirmed in git log
- All 8 auth-guard tests: PASS
- TypeScript: clean
