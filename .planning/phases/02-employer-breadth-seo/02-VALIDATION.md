---
phase: 2
slug: employer-breadth-seo
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-10
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (root `vitest.config.ts`) |
| **Config file** | `/vitest.config.ts` |
| **Quick run command** | `pnpm vitest run --reporter=verbose` |
| **Full suite command** | `pnpm vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm vitest run --reporter=verbose`
- **After Wave 1 complete:** Run full suite + check `pnpm tsc --noEmit`

---

## Phase Requirements → Test Map

| Req ID | Behavior Under Test | Test Type | Automated Command | File Exists? |
|--------|---------------------|-----------|-------------------|-------------|
| COVG-01 | ATS detection returns correct atsType + confidence | unit | `pnpm vitest run workers/discover/test/probe.test.ts` | ❌ Wave 0 |
| COVG-02 | Wave 1 targets parse without error | unit (source contract) | `pnpm vitest run workers/ingest/test/wave1.test.ts` | ❌ Wave 0 |
| COVG-03 | Adzuna adapter does NOT call expireMissingJobs | unit (source contract) | `pnpm vitest run workers/ingest/test/aggregator-no-expire.test.ts` | ❌ Wave 0 |
| COVG-03 | Adzuna response normalization produces valid job rows | unit | `pnpm vitest run packages/ats-adapters/test/adzuna.test.ts` | ❌ Wave 0 |
| SEO-01 | JSON-LD block present when description IS NOT NULL | unit | `pnpm vitest run apps/web/test/jobs.test.ts` | ✅ extend |
| SEO-01 | JSON-LD absent when description is null | unit | `pnpm vitest run apps/web/test/jobs.test.ts` | ✅ extend |
| SEO-02 | fetchDescription routes correctly per ats_type | unit | `pnpm vitest run workers/ingest/test/fetch-description.test.ts` | ❌ Wave 0 |
| SEO-03 | pingUrlUpdated called after insert in ingest.ts | unit (source contract) | `pnpm vitest run workers/ingest/test/creation-ping.test.ts` | ❌ Wave 0 |
| SEO-03 | pingUrlUpdated called after description update in enrich.ts | unit (source contract) | `pnpm vitest run workers/ingest/test/description-ping.test.ts` | ❌ Wave 0 |

---

## Wave 0 Test Files to Create

- [ ] `workers/discover/test/probe.test.ts` — covers COVG-01
- [ ] `workers/ingest/test/aggregator-no-expire.test.ts` — covers COVG-03 expire guard
- [ ] `workers/ingest/test/fetch-description.test.ts` — covers SEO-02
- [ ] `workers/ingest/test/creation-ping.test.ts` — covers SEO-03 creation
- [ ] `workers/ingest/test/description-ping.test.ts` — covers SEO-03 description update
- [ ] `packages/ats-adapters/test/adzuna.test.ts` — covers COVG-03 adapter
- [ ] `packages/ats-adapters/test/smartrecruiters.test.ts` — covers COVG-02 adapter
- [ ] Extend `apps/web/test/jobs.test.ts` for JSON-LD assertions (file exists)

> **Source contract pattern** (from `upsert.test.ts`): read source file as string; assert expected code pattern is present. Avoids runtime mock complexity for CF Worker environment.

---

## Dimension 8 Coverage

All 6 phase requirements (COVG-01, COVG-02, COVG-03, SEO-01, SEO-02, SEO-03) have at least one automated test mapped. Wave 0 gap files must be created before Wave 1 execution tasks begin.
