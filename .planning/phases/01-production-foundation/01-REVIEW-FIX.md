---
phase: 01-production-foundation
fixed_at: 2026-05-10T00:00:00Z
review_path: .planning/phases/01-production-foundation/01-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 01: Code Review Fix Report

**Fixed at:** 2026-05-10T00:00:00Z
**Source review:** .planning/phases/01-production-foundation/01-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 6 (3 Critical, 3 Warning; Info excluded per fix_scope)
- Fixed: 6
- Skipped: 0

## Fixed Issues

### CR-01: Unsanitized employer HTML rendered with `set:html` — stored XSS

**Files modified:** `workers/ingest/src/ingest.ts`
**Commit:** 31b85e4
**Applied fix:** Imported `sanitizeJobDescription` from the existing `@owljobs/ats-adapters/sanitize` (Workers-compatible regex-based sanitizer, no DOM dependency). Applied it at two call sites in `upsertJob`: the initial `description` insert and the description backfill path. The sanitizer strips `<script>`, `<iframe>`, `<style>`, `<form>`, `<object>`, `<embed>`, event handler attributes (`on*`), and `javascript:` hrefs.

Note: Chose sanitization at ingest (DB write) rather than render time — keeps the DB clean so any future render path is safe without additional changes. The existing `sanitizeJobDescription` function was purpose-built for this worker environment and avoids the jsdom/isomorphic-dompurify compatibility issues the reviewer warned about.

### CR-02: Re-subscription upsert un-confirms existing confirmed subscribers and rotates sent unsubscribe tokens

**Files modified:** `apps/web/src/pages/api/subscribe.ts`
**Commit:** 70870fd
**Applied fix:** Changed `ignoreDuplicates: false` to `ignoreDuplicates: true` so re-submissions are a no-op for existing rows. Updated the SELECT to also fetch `confirmed_at`. Added error handling when the SELECT fails (returns 500 instead of silently falling back to freshly-generated tokens not in the DB). Added early return with a neutral message when the subscriber is already confirmed, preventing confirmation email resend. Removed the dead-code nullish-coalescing fallbacks; now uses `subData.confirmation_token` and `subData.unsubscribe_token` directly.

### CR-03: HTML injection in GDPR deletion request email body

**Files modified:** `apps/web/src/lib/resend.ts`
**Commit:** 095e7ca
**Applied fix:** Added `htmlEncode()` helper at the top of the file that escapes `&`, `<`, `>`, and `"`. Applied `htmlEncode(opts.requesterEmail)` before interpolating into the deletion email HTML body.

### WR-01: `privacy.astro` hardcodes "Wind Turbine Jobs" and `privacy@windturbinejobs.com` — multi-niche violation

**Files modified:** `apps/web/src/pages/privacy.astro`
**Commit:** 7f0ebcb
**Applied fix:** Removed `export const prerender = true` so the page runs as SSR and `Astro.locals` is available at request time. Added `const { niche } = Astro.locals`. Updated the Layout `description` prop, the "Who we are" paragraph, and the GDPR contact email to use `niche.name` and `niche.domain` respectively. Left "May 2025" unchanged (not a multi-niche violation — a datestamp, in scope for manual update).

### WR-02: `/jobs.json` debug endpoint returns expired jobs

**Files modified:** `workers/ingest/src/index.ts`
**Commit:** 8fcac4b
**Applied fix:** Added `.eq("status", "active")` filter to the `/jobs.json` Supabase query, consistent with `listJobs`, `listFeedJobs`, `listSitemapJobs`, and `listEmployerJobs` in `apps/web/src/lib/jobs.ts`.

### WR-03: `wrangler.toml` queue consumers use `max_batch_size = 10` — violates CLAUDE.md email digest pattern

**Files modified:** `workers/ingest/wrangler.toml`
**Commit:** 60efcb7
**Applied fix:** Changed `max_batch_size` from `10` to `2` for both `owljobs-classify` and `owljobs-enrich` consumers, matching the CLAUDE.md hard rule: "Email digest pattern: Cron → Queue (max_batch_size: 2) → Resend."

---

_Fixed: 2026-05-10T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
