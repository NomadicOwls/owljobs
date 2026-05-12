---
phase: 03-candidate-activation
plan: 04
subsystem: ui
tags: [astro-component, social-proof, ops-checkpoint, milestone, cand-04, d-12]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: Newsletter.astro double-opt-in subscribe form + subscribers table (wind_turbine.subscribers)
provides:
  - Static social proof copy "420+ jobs from 20+ employers" on the subscribe form (D-12)
  - Source-contract test asserting the copy is present and placed correctly
  - Inline HTML comment documenting the manual-update convention for future operators
  - Operator-side tracking checkpoint for ≥100 confirmed-subscriber hard gate (D-11/D-13)
affects: [phase 5 monetization entry gate, candidate activation outreach, employer pitch credibility]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Source-contract tests via readFile on .astro source (style adopted from subscribe.test.ts INFRA-06 pattern)"
    - "Static, manually-updated social-proof copy with inline maintainer comment (no dynamic data, no DB fetch)"

key-files:
  created:
    - apps/web/test/newsletter.test.ts
  modified:
    - apps/web/src/components/Newsletter.astro

key-decisions:
  - "Static text per D-12 (NOT a dynamic Astro.locals fetch) — keeps subscribe form on the edge with zero extra DB load, manually updated after major ingest milestones"
  - "Copy lives in un-confirmed branch only — post-confirmation message stays clean (no marketing noise after the user has already converted)"
  - "100-subscriber hard gate is an operator/ops milestone (D-11 outreach), explicitly enforced at Phase 5 entry per ROADMAP.md; NOT closed by a code task in Phase 3"
  - "font-medium + text-foreground for the proof line (visual weight); text-xs + text-muted-foreground for the 'No spam' footer (subordinate)"

patterns-established:
  - "CAND-04 social proof: static copy in subscribe-form footer with inline HTML comment carrying the manual-update convention (`<!-- CAND-04 social proof (D-12) — static copy, update manually after major ingests / subscriber milestones -->`)"
  - "Source-contract test pattern reused for component-source assertions (readFile + regex against .astro string)"

requirements-completed: []  # Intentionally EMPTY — CAND-04 reads "Minimum 100 confirmed subscribers acquired via active outreach", which is an operator outreach milestone, not a code deliverable. This plan ships the code piece of CAND-04 (D-12 social proof copy) and the ops-tracking convention, but the requirement itself is closed at Phase 5 entry once the operator hits ≥100 confirmed subscribers. DO NOT auto-tick CAND-04 in REQUIREMENTS.md from this SUMMARY.
requirements-partial: [CAND-04]  # Code piece (D-12 social proof) shipped; operator outreach gate pending

# Metrics
duration: 2min
completed: 2026-05-12
---

# Phase 3 Plan 4: CAND-04 Social Proof + Outreach Milestone Tracking Summary

**Static social-proof line "420+ jobs from 20+ employers" added above subscribe-form footer with source-contract test; CAND-04 ≥100-subscriber gate flagged as ops checkpoint pending operator action.**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-05-12T02:31:59Z
- **Completed:** 2026-05-12T02:33:55Z
- **Tasks:** 2 of 3 code-side tasks complete (Task 3 is a `checkpoint:human-action` — see below)
- **Files modified:** 2 (1 created, 1 edited)

## Accomplishments

- D-12 social-proof copy "420+ jobs from 20+ employers" now rendered on the subscribe form in `Newsletter.astro`, placed above the existing "No spam, unsubscribe anytime." line in the un-confirmed branch only.
- 3-assertion source-contract test in `apps/web/test/newsletter.test.ts` asserting the literal copy, its placement after `id="subscribe-form"`, and no regression on the "No spam" line — all GREEN.
- Inline HTML comment `<!-- CAND-04 social proof (D-12) — static copy, update manually after major ingests / subscriber milestones -->` documents the maintainer convention for future operators bumping the count.
- TDD cycle clean: RED commit (test alone) → GREEN commit (single-file copy edit) → no refactor needed.
- TypeScript clean: `cd apps/web && pnpm exec tsc --noEmit` exits 0.
- No regression on pre-existing `subscribe.test.ts` (4/4 GREEN after the edit).

## Task Commits

Each task committed atomically per TDD gate sequence:

1. **Task 1: Source-contract test for Newsletter social proof copy (RED)** — `573d86f` (`test(03-04)`)
2. **Task 2: Add social proof copy to Newsletter.astro (GREEN)** — `b34a4e5` (`feat(03-04)`)
3. **Task 3: CAND-04 outreach milestone tracking** — DEFERRED to orchestrator (see "User Setup Required" below). `checkpoint:human-action` requires (a) operator-run Supabase SQL, (b) edit to `.planning/STATE.md`. Both are out of the worktree executor's authority per the parallel-execution rules in this prompt ("Do NOT modify STATE.md or ROADMAP.md"). The operator + orchestrator handle this post-merge.

**Plan metadata commit:** SUMMARY.md committed as part of the worktree's final docs commit (orchestrator merges to main).

## Files Created/Modified

- `apps/web/test/newsletter.test.ts` — **created.** Source-contract test for D-12 copy: asserts presence of `420+ jobs from 20+ employers`, placement after `id="subscribe-form"` (so it's in the un-confirmed branch), and no-regression on the "No spam, unsubscribe anytime." line.
- `apps/web/src/components/Newsletter.astro` — **modified.** Inserted a maintainer-comment + social-proof `<p>` (font-medium / text-foreground) above the existing footer "No spam" `<p>` (text-xs / text-muted-foreground) in the un-confirmed branch. 5 insertions, 1 deletion (the original `<p>` was rewritten to keep the no-spam line below the new proof line).

## Decisions Made

- **Static copy, not dynamic.** D-12 is explicit: the social-proof line is hand-edited by the operator after major ingests / subscriber milestones. No `fetch()`, no `Astro.locals.someCount`. Rationale: zero extra DB load on every page render, no risk of mid-render failure killing the subscribe section, and the count moves slowly enough that monthly hand-edits are sufficient.
- **Un-confirmed branch only.** Social proof appears in the form-rendering branch; the post-confirmation thank-you message stays clean. Rationale: the user has already converted — additional marketing copy adds noise without function.
- **Visual hierarchy.** Proof line is `text-sm font-medium text-foreground`; the existing "No spam" footer is `text-xs text-muted-foreground`. The proof line draws the eye; the legal/comfort footer remains subordinate.
- **CAND-04 gate is ops, not code.** Reaching 100 confirmed subscribers is a manual outreach milestone (D-11 channels: LinkedIn wind communities, direct candidate outreach, SEO organic). The plan + this summary record the convention; Phase 5 entry verifies the count.

## Deviations from Plan

None - plan executed exactly as written. The code edit matches the action block verbatim (maintainer comment + two-`<p>` block), and the test was written character-for-character as specified.

## Issues Encountered

- **Node modules missing in worktree on first test run.** Resolved by running `pnpm install` (≈23 s) before the first RED-phase test execution. Single workspace-level install picked up vitest 4.1.5 and the rest of devDependencies. Not a deviation — expected first-time-in-worktree behavior. `pnpm-lock.yaml` was already staged-as-modified at worktree spawn (pre-existing state), kept untouched in commits.
- **`astro check` surfaces 1 pre-existing error + 2 pre-existing warnings outside plan scope.** Task 2's `<behavior>` block specified both `astro check` and `tsc --noEmit` must exit 0. `tsc --noEmit` exits 0. `astro check` reports 1 error (`apps/web/src/components/ui/Input.astro:17` ts(2322)) + 2 unused-import warnings (`FeaturedJobCard.astro`, `JobCardModern.astro`) — all three files unchanged since `72386ec Initial commit`, NOT touched or imported by this plan. Per scope-boundary rule ("Only auto-fix issues DIRECTLY caused by the current task's changes") these are out of scope and logged to `.planning/phases/03-candidate-activation/deferred-items.md` for a future Phase 4 cleanup plan. Newsletter.astro itself passes `astro check` clean — the global exit code is non-zero because of unrelated files.

## User Setup Required

**Task 3 (`checkpoint:human-action`) requires post-merge operator action.** This worktree executor is forbidden from editing `.planning/STATE.md` per the parallel-execution rules. The orchestrator should surface the following operator task after merging this plan:

### CAND-04 outreach milestone tracking (operator)

1. After deploy of the Newsletter copy change, run this Supabase query (D-13):

   ```sql
   SELECT COUNT(*) AS confirmed_count
     FROM wind_turbine.subscribers
    WHERE confirmed_at IS NOT NULL;
   ```

2. Update `.planning/STATE.md`:
   - In the **Performance Metrics** table, replace the existing `Confirmed subscribers` row with:
     ```markdown
     | Confirmed subscribers | <COUNT> / 100 (hard gate for Phase 5) |
     ```
   - Append to **Active Todos**:
     ```markdown
     - CAND-04 outreach in flight — current count <COUNT>/100 (D-11 channels: LinkedIn wind communities, direct candidate outreach, SEO organic). Manual Supabase query monthly; phase-gate Phase 5 entry on this count.
     ```
   - If `Last Session` is older than today, update it to reflect this measurement.

3. If outreach has not yet started (count near 0), still record the current state — that is acceptable for closing Phase 3 since CAND-04 is explicitly enforced at Phase 5 entry (per `.planning/ROADMAP.md` "Notes").

### Verification

- `grep -E 'Confirmed subscribers \| [0-9]+ / 100' .planning/STATE.md` → match
- `grep -q 'CAND-04 outreach' .planning/STATE.md` → match
- Count in the operator's resume signal matches the Supabase query result

## Next Phase Readiness

- **Phase 3 code-side complete after merge.** D-12 copy is live in source; awaiting Cloudflare Pages deploy (existing `PAGES_DEPLOY_HOOK`).
- **Phase 5 entry remains gated** by the operator-tracked ≥100 confirmed-subscribers hard gate per `.planning/ROADMAP.md` Notes. The tracking convention is established (manual Supabase query, monthly cadence, recorded in STATE.md). Phase 5 entry checkpoint verifies before any cold-pitch work.
- **No new threats introduced.** STRIDE register accepted T-03-08 (stale social proof copy) as an editorial concern, not a security one — inline comment documents the update convention.

## Self-Check

- `apps/web/test/newsletter.test.ts` — FOUND (committed in `573d86f`)
- `apps/web/src/components/Newsletter.astro` social-proof copy — FOUND via `grep -q '420+ jobs from 20+ employers'`
- `apps/web/src/components/Newsletter.astro` CAND-04 comment — FOUND via `grep -q 'CAND-04 social proof'`
- `apps/web/src/components/Newsletter.astro` "No spam" line — FOUND (preserved)
- Commit `573d86f` (RED) — FOUND in `git log`
- Commit `b34a4e5` (GREEN) — FOUND in `git log`
- TDD gate sequence: `test(03-04)` (RED) → `feat(03-04)` (GREEN) — compliant
- All 3 newsletter test assertions GREEN; all 4 subscribe test assertions GREEN (no regression)
- TypeScript clean (`tsc --noEmit` exit 0)
- `astro check` non-zero exit but ALL diagnostics are in pre-existing, untouched files — out-of-scope deferred items logged

## Self-Check: PASSED

---
*Phase: 03-candidate-activation*
*Completed: 2026-05-12*
