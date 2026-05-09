---
phase: 1
slug: production-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-09
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `vitest@^4.1.5` |
| **Config file** | `vitest.config.ts` (none — Wave 0 installs) |
| **Quick run command** | `pnpm vitest run --reporter=basic --bail=1` |
| **Full suite command** | `pnpm vitest run --coverage` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm vitest run --bail=1`
- **After every plan wave:** Run `pnpm vitest run` + `pnpm --filter @owljobs/web typecheck`
- **Before `/gsd-verify-work`:** Full suite must be green + manual smoke checklist complete
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| expire-unit | 01 | 1 | DATA-01 | — | `expireMissingJobs` marks rows absent from fetched set | unit | `pnpm vitest run workers/ingest/test/expire.test.ts -t "expireMissingJobs"` | ❌ W0 | ⬜ pending |
| expire-skip | 01 | 1 | DATA-01 | — | skips when fetched set is empty (guard against mass-expiry) | unit | `pnpm vitest run workers/ingest/test/expire.test.ts -t "skips on empty fetch"` | ❌ W0 | ⬜ pending |
| reactivate | 01 | 1 | DATA-01 | — | `upsertJob` re-activates expired row when job re-appears | unit | `pnpm vitest run workers/ingest/test/upsert.test.ts -t "re-activate"` | ❌ W0 | ⬜ pending |
| jwt-sign | 01 | 1 | DATA-03 | — | `signServiceAccountJWT` produces valid RS256 JWT via jose | unit | `pnpm vitest run workers/ingest/test/google-indexing.test.ts -t "signs JWT"` | ❌ W0 | ⬜ pending |
| ping-url | 01 | 1 | DATA-03 | — | `pingUrlUpdated` returns `{ok, status}` and surfaces fetch errors | unit (mocked fetch) | `pnpm vitest run workers/ingest/test/google-indexing.test.ts -t "pingUrlUpdated"` | ❌ W0 | ⬜ pending |
| active-filter | 02 | 2 | DATA-02 | — | `listJobs` excludes `status='expired'` rows | unit | `pnpm vitest run apps/web/test/jobs.test.ts -t "active filter"` | ❌ W0 | ⬜ pending |
| sitemap-filter | 02 | 2 | DATA-02 | — | sitemap.xml.ts excludes expired jobs | unit (snapshot) | `pnpm vitest run apps/web/test/sitemap.test.ts` | ❌ W0 | ⬜ pending |
| 410-branch | 02 | 2 | DATA-02 | — | `[slug].astro` returns 410 for expired job | manual-only | `curl -sI https://<domain>/jobs/<expired-slug>` | manual | ⬜ pending |
| consent-reject | 03 | 2 | INFRA-06 | V5 | `/api/subscribe` rejects `consent: false` | integration | `pnpm vitest run apps/web/test/subscribe.test.ts -t "rejects no consent"` | ❌ W0 | ⬜ pending |
| consent-write | 03 | 2 | INFRA-06 | V8 | `/api/subscribe` writes `consent_given_at` | integration | `pnpm vitest run apps/web/test/subscribe.test.ts -t "writes consent_given_at"` | ❌ W0 | ⬜ pending |
| delete-turnstile | 04 | 2 | INFRA-08 | V5 | `/api/delete-request` requires valid Turnstile token | integration | `pnpm vitest run apps/web/test/delete-request.test.ts -t "Turnstile required"` | ❌ W0 | ⬜ pending |
| delete-email | 04 | 2 | INFRA-08 | — | `/api/delete-request` sends email via Resend on success | integration (mocked Resend) | `pnpm vitest run apps/web/test/delete-request.test.ts -t "sends email"` | ❌ W0 | ⬜ pending |
| unsubscribe | 06 | 4 | INFRA-07 | — | `/api/unsubscribe` POST deletes subscriber row | integration | `pnpm vitest run apps/web/test/unsubscribe.test.ts -t "POST deletes row"` | ❌ W0 | ⬜ pending |
| ops-smoke | 05 | 3 | INFRA-02/03/04 | V14 | Production smoke after deploy | manual | `curl -sI https://<domain>/` + subscribe with real email | manual | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Plan 01 Task 1 (Wave 1) scaffolds the test framework. Must create:

- [ ] `vitest.config.ts` at repo root (workspace-wide, picks up `apps/*/test/**` and `workers/*/test/**`)
- [ ] `pnpm add -D -w vitest @vitest/coverage-v8` at root
- [ ] `workers/ingest/test/` directory with mock `SchemaClient` + Supabase response fixtures
- [ ] `apps/web/test/` directory with mock `getEnv`, mock Supabase, mock Resend fixtures
- [ ] Stub test files for all ❌ W0 entries above (empty `describe` blocks to satisfy import resolution)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| HTTP 410 on expired job slug | DATA-02 | Requires a real Supabase row in `expired` state + live Cloudflare Pages deploy | After Wave 3 deploy: pick an expired job ID from DB, compute slug, `curl -sI https://<domain>/jobs/<slug>` → must return `HTTP/2 410` |
| Consent checkbox blocks submit | INFRA-06 | Browser interaction (disabled button / JS validation) | Visit `/`, try to submit subscribe form without ticking consent → inline error appears, no network request |
| GDPR deletion email received | INFRA-08 | Requires real Turnstile click + live Resend | Visit `/privacy`, submit deletion form with real email → founder mailbox receives notification within 60s |
| Confirmation email + RFC 8058 headers | INFRA-07 | Requires real inbox + live Resend | Subscribe with real email, open raw source → verify `List-Unsubscribe` and `List-Unsubscribe-Post` headers present |
| Privacy page sub-processors table | INFRA-05 | Prerendered page inspection | `curl -s https://<domain>/privacy \| grep -c "Sub-processors"` ≥1 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (installed in Plan 01 Task 1)
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter (set after wave_0_complete = true)

**Approval:** pending
