# Phase 3 — Deferred Items

Out-of-scope issues discovered during plan execution. Surfaced for future cleanup
plans; NOT fixed in the plan where they were observed (per executor scope-boundary
rule: "Only auto-fix issues DIRECTLY caused by the current task's changes").

## From 03-04 (CAND-04 social proof)

Discovered while running plan-required verification `cd apps/web && pnpm exec astro check`
on 2026-05-12. None of these touch `Newsletter.astro` or `newsletter.test.ts`. All
three files are unchanged since `72386ec Initial commit` — pre-existing, not regressions.

| Severity | File | Line | Code | Message |
|----------|------|------|------|---------|
| error | `apps/web/src/components/ui/Input.astro` | 17 | ts(2322) | `Type 'string' is not assignable to type 'HTMLInputTypeAttribute | null | undefined'` — `type` prop needs narrowing or typing fix |
| warning | `apps/web/src/components/FeaturedJobCard.astro` | 21 | ts(6133) | `'applyUrl' is declared but its value is never read` |
| warning | `apps/web/src/components/JobCardModern.astro` | 2 | ts(6133) | `'Badge' is declared but its value is never read` |

**Recommendation:** Bundle into a Phase 4 (Employer Product) cleanup plan that
touches these UI components, or a dedicated `chore: astro check clean` micro-plan
before Phase 4 starts. `tsc --noEmit` already passes cleanly — the `astro check`
diagnostics are stricter (Astro's TS language server narrows union types tighter
than `tsc` for `.astro` files).
