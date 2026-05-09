# Testing Patterns
_Last updated: 2026-05-09_

## Summary

OwlJobs has no test suite. There are zero `.test.ts`, `.spec.ts`, or similar test files anywhere in the repository. No test framework (Jest, Vitest, Playwright, etc.) is installed in any `package.json`. No CI pipeline exists — there is no `.github/workflows/` directory. Quality assurance relies entirely on TypeScript's type checker (`tsc --noEmit` and `astro check`) run manually via `pnpm typecheck`. This is an early-stage project where testing infrastructure has not yet been established.

## Details

### Test Framework

**Runner:** None installed  
**Assertion library:** None  
**Test files found:** 0

### Test Commands

```bash
# No test commands exist. Type checking only:
pnpm typecheck          # Runs tsc --noEmit across all packages via Turborepo
```

Per-workspace:
```bash
# apps/web
astro check && tsc --noEmit

# workers/ingest
tsc --noEmit

# packages/schema, packages/niches, packages/ats-adapters
tsc --noEmit
```

### CI/CD

No `.github/` directory exists. No GitHub Actions, CircleCI, or other CI configuration. Deploys are manual via `wrangler deploy` and Cloudflare Pages deploy hooks triggered from the ingest worker.

### What Has Test Coverage

Nothing. No code path is covered by automated tests.

### What Lacks Test Coverage (All of It)

**`packages/schema/src/index.ts`** — `normalizeForKey`, `sha256Hex` utility functions. Pure functions, easy to unit test.

**`packages/ats-adapters/src/`** — All ATS adapter fetch functions (`fetchAllWorkdayJobs`, `fetchAllGreenhouseJobs`, etc.) and the HTML sanitizer in `sanitize.ts`. Critical path: bugs here cause silent data loss or corrupt job records.

**`packages/niches/src/index.ts`** — Registry functions (`registerNiche`, `getNiche`, `nicheFromHost`). Simple but tested behavior would prevent host-routing regressions.

**`workers/ingest/src/classify.ts`** — Cosine similarity (`cosine`, `maxCosine`), embedding text builder (`buildEmbedText`), LLM response parser (`llmYesNo`). The classification logic is the core business logic of the system and is entirely untested.

**`workers/ingest/src/enrich.ts`** — Enrichment pipeline logic.

**`workers/ingest/src/ingest.ts`** — Dedup logic, upsert behavior.

**`apps/web/src/lib/jobs.ts`** — Query builder functions (`listJobs`, `getJobBySlug`, `listEmployerJobs`). The `as unknown as` casts in these functions mask Supabase type mismatches that tests would catch.

**`apps/web/src/lib/slug.ts`** — Slug generation and prefix extraction. Pure functions, high regression risk if changed.

### Recommended Starting Points

If adding tests, the highest-value targets in order:

1. **`packages/schema`** — `normalizeForKey`, `sha256Hex` — zero dependencies, pure functions, trivial to test with Vitest
2. **`apps/web/src/lib/slug.ts`** — slug/prefix round-trip — pure, critical for URL routing
3. **`workers/ingest/src/classify.ts`** — `cosine`, `maxCosine`, `buildEmbedText` — pure math/string functions extractable from Cloudflare AI dependency
4. **`packages/ats-adapters`** — adapters testable with mocked `fetch` via Vitest's `vi.spyOn`

### Suggested Framework

Vitest is the natural fit given the ES2022 module target and workspace structure. It requires no transpilation step and works with `moduleResolution: bundler`.

```bash
# To bootstrap:
pnpm add -Dw vitest
# Add to root package.json scripts:
"test": "vitest run"
```

## Key Facts

- Zero test files in the entire repository
- No test framework installed anywhere
- No CI pipeline — no `.github/workflows/` directory
- Type checking (`tsc --noEmit`) is the only automated quality gate
- `as unknown as` casts in `apps/web/src/lib/jobs.ts` mask Supabase return type mismatches
- Classify logic (`cosine`, `maxCosine`, `llmYesNo`) is untested core business logic
- Slug functions in `apps/web/src/lib/slug.ts` are pure and high-risk if modified without tests
- Vitest is the recommended framework when tests are added (compatible with ES2022 + bundler resolution)
