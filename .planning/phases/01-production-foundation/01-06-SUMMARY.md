---
phase: "01"
plan: "06"
subsystem: unsubscribe
tags: [INFRA-07, RFC-8058, one-click-unsubscribe, verification-only]
dependency_graph:
  requires: ["01-05"]
  provides: ["INFRA-07 verified"]
  affects: ["apps/web/src/lib/resend.ts", "apps/web/src/pages/api/unsubscribe.ts"]
tech_stack:
  added: []
  patterns: ["RFC 8058 List-Unsubscribe-Post one-click"]
key_files:
  created: []
  modified:
    - .planning/phases/01-production-foundation/RUNBOOK.md
decisions:
  - "Plan 06 is verification-only per RESEARCH Pitfall 9 — modifying working INFRA-07 code risks regression"
  - "Source-contract pre-check confirms INFRA-07 intact after Plans 01–05 (no regression)"
metrics:
  duration: ~5min (Task 1 auto; Task 2 pending human verify)
  completed: 2026-05-10
---

# Phase 1 Plan 06: INFRA-07 Verification Summary

One-line: Source-contract greps confirm RFC 8058 one-click unsubscribe headers and handlers are intact in production code — live verification pending operator checkpoint.

## What Was Built

This is a **verification-only plan** (per RESEARCH Pitfall 9). No code was written or modified.

The existing implementation was confirmed intact:
- `apps/web/src/lib/resend.ts:59-62` — `"List-Unsubscribe"` + `"List-Unsubscribe-Post": "List-Unsubscribe=One-Click"` headers are set in `sendConfirmation`
- `apps/web/src/pages/api/unsubscribe.ts` — both `GET` (renders HTML confirmation page + deletes row) and `POST` (RFC 8058 one-click handler returning 200/OK) are exported

## Tasks

| Task | Name | Commit | Files | Status |
|------|------|--------|-------|--------|
| 1 | Source-contract pre-check | 982dae2 | RUNBOOK.md | Complete |
| 2 | Live verification (RFC 8058 headers + POST + Gmail one-click) | — | RUNBOOK.md (pending) | CHECKPOINT — awaiting operator |

## Deviations from Plan

None — plan executed exactly as written. Task 1 is auto (complete). Task 2 is checkpoint:human-verify (stopped as required).

## Checkpoint Status

**Task 2 is a blocking `checkpoint:human-verify`.** The operator must:

1. Subscribe with a real Gmail or Outlook test email at https://windturbinejobs.com/
2. Inspect the confirmation email source and confirm both `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers are present
3. Run `curl -sX POST -w "%{http_code}" "<unsubscribe-URL>"` — expect 200 + body "OK"
4. Confirm Supabase `SELECT count(*) FROM wind_turbine.subscribers WHERE email = '...'` returns 0
5. Re-subscribe, then use Gmail UI "Unsubscribe" link to trigger RFC 8058 — confirm DB row deleted again
6. Fill in the `### INFRA-07 verification` placeholders in RUNBOOK.md `## 10. Smoke Test Results`
7. Type "INFRA-07 verified" to close the checkpoint

## Known Stubs

None — this plan has no code outputs.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes introduced (verification-only plan).

## Self-Check: PASSED

- RUNBOOK.md modified and committed: 982dae2 (confirmed)
- SUMMARY.md created: this file
- No code files created or modified (verification-only per plan design)
