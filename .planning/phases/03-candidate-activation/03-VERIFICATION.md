---
phase: 03-candidate-activation
verified: 2026-05-12T03:30:00Z
status: human_needed
score: 11/11
overrides_applied: 0
human_verification:
  - test: "Weekly digest delivery — SC #1"
    expected: "A confirmed subscriber receives a weekly digest email at 06:00 UTC on Monday containing only new matching jobs for their niche"
    why_human: "Requires production deploy of workers/digest + supabase db push (migration 0006) + DIGEST_QUEUE binding wrangler secret. Cron trigger cannot be exercised without a live Workers deployment."
  - test: "RFC 8058 inbox check — SC #2 GET flow"
    expected: "Clicking the List-Unsubscribe link in a real email client (Gmail / Outlook) navigates to /api/unsubscribe?token=... and the subscriber row has confirmed_at = NULL after the GET"
    why_human: "Requires a real sent email with a token-bearing unsubscribe URL; cannot simulate a mail-client click programmatically."
  - test: "RFC 8058 inbox check — SC #2 POST (one-click) flow"
    expected: "Gmail / Outlook one-click unsubscribe triggers a POST to /api/unsubscribe?token=... and returns HTTP 200 OK; subscriber row has confirmed_at = NULL"
    why_human: "RFC 8058 POST is issued by the mail client, not by the subscriber. Cannot test without a real email client making the one-click request against a deployed endpoint."
  - test: "Idempotency guard — SC #3 live replay"
    expected: "Triggering the digest worker twice for the same Monday produces exactly one email_sends row per subscriber per (sent_date, type); second invocation skips all sends (23505 caught, 0 Resend calls)"
    why_human: "Requires deployed worker + Supabase. Source-contract tests lock in the code path; the live DB constraint requires supabase db push to be effective."
  - test: "supabase db push — migration 0006 applied to production"
    expected: "Running supabase db push applies migration 0006_email_sends_idempotency.sql to the production Supabase project; psql \\d email_sends shows the UNIQUE constraint email_sends_subscriber_date_type_key"
    why_human: "Operator task. Requires Supabase project access and the DB push command from the RUNBOOK. Code deliverable (migration file) is present; activation is a deploy gate."
  - test: "workers/digest deployed to Cloudflare Workers"
    expected: "wrangler deploy in workers/digest succeeds; worker appears in Cloudflare dashboard with cron trigger 0 6 * * 1 active; DIGEST_QUEUE binding and SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / RESEND_API_KEY secrets set"
    why_human: "Operator task. Requires wrangler CLI + Cloudflare account credentials + Resend API key configured as Worker secret."
  - test: "No fetch handler exposure — T-03-04"
    expected: "Deployed worker returns 405 or does not respond to arbitrary HTTP GET / POST (no fetch handler exported)"
    why_human: "Code verified: workers/digest/src/index.ts exports only scheduled and queue handlers via export default handler. Confirming absence of HTTP surface requires a live curl against the deployed worker URL."
  - test: "GDPR re-subscribe flow after soft-unsubscribe"
    expected: "A previously-unsubscribed user who submits the subscribe form again receives a new confirmation email and, after clicking confirm, has confirmed_at repopulated in the existing subscribers row (no duplicate row)"
    why_human: "Requires deployed Astro frontend + live Supabase row. The code preserves the row (confirmed_at = NULL, not DELETE); verifying the re-confirm endpoint writes back confirmed_at requires a live round-trip."
  - test: "Digest email rendering — zero-jobs week"
    expected: "When no new jobs exist for a niche in the past 7 days, the digest email is still sent (D-03 decision) with a no-new-jobs message; subscriber does not receive an empty/broken email"
    why_human: "Requires live Worker + Resend. Source-contract test verifies the zero-jobs branch exists in code; visual rendering of the actual email template requires manual inspection of a sent email."
  - test: "SC #4 hard gate — confirm ≥100 double-opt-in subscribers before Phase 5 entry"
    expected: "SELECT COUNT(*) FROM wind_turbine.subscribers WHERE confirmed_at IS NOT NULL returns >= 100"
    why_human: "SC #4 is an operator acquisition milestone, not a code deliverable. The code mechanism (D-12 social proof copy in Newsletter.astro) shipped in Plan 03-04. The count must be confirmed by the operator before Phase 5 can start, per ROADMAP hard-gate rule."
  - test: "STATE.md CAND-04 Active Todos bullet"
    expected: "An entry for CAND-04 outreach milestone tracking appears in the Active Todos section of .planning/STATE.md"
    why_human: "Plan 03-04 Task 3 was a checkpoint:human-action deliberately deferred from the worktree executor (scope-boundary rule). One-line markdown append for the orchestrator to confirm before closing Phase 3."
---

# Phase 3: Candidate Activation — Verification Report

**Phase Goal:** A real, growing candidate audience exists — the prerequisite that unlocks the employer FOMO pitch.
**Verified:** 2026-05-12T03:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `workers/digest/src/index.ts` exports `scheduled` and `queue` handlers (no `fetch` handler — T-03-04) | VERIFIED | `export default handler` at line 347; `scheduled(` and `queue(` present; no `async fetch(` match |
| 2 | `scheduled()` enqueues per-niche subscriber batches to DIGEST_QUEUE (never loops-and-sends) | VERIFIED | `DIGEST_QUEUE.send` present; cron to queue fan-out confirmed; digest.test.ts 14/14 GREEN |
| 3 | `queue()` consumer sends to `https://api.resend.com/emails/batch` | VERIFIED | URL confirmed in index.ts; wrangler.toml `max_batch_size = 1` |
| 4 | `List-Unsubscribe-Post` header set in outgoing digest email (RFC 8058 — CAND-02) | VERIFIED | Header at line 319 of index.ts; digest.test.ts asserts the header |
| 5 | Insert-before-send ordering: `email_sends` INSERT (line 280) precedes Resend API fetch (line 305) | VERIFIED | Line 280 < line 305; idempotency.test.ts 4/4 GREEN locks the contract |
| 6 | Idempotency: 23505 unique-violation caught and triggers `continue` (not throw) | VERIFIED | `if (insertError?.code === "23505") { continue; }` at lines 288-291 |
| 7 | Migration 0006 file exists with UNIQUE(subscriber_id, sent_date, type) | VERIFIED | `packages/schema/src/migrations/0006_email_sends_idempotency.sql` exists; constraint count=1 |
| 8 | No `wind_turbine` string literal in non-comment worker code (multi-niche constraint) | VERIFIED | grep non-comment lines — 0 matches |
| 9 | Both `/api/unsubscribe` handlers use `.update({ confirmed_at: null })` (not `.delete()`) | VERIFIED | Count=2 confirmed; no executable `.delete()` calls; unsubscribe.test.ts 8/8 GREEN |
| 10 | POST handler reads token from `url.searchParams` (not POST body) and returns 200 OK unconditionally | VERIFIED | `url.searchParams.get("token")` count=2; `new Response("OK", { status: 200 })` confirmed |
| 11 | Newsletter.astro contains "420+ jobs from 20+ employers" social proof copy (CAND-04 D-12) | VERIFIED | Present in Newsletter.astro; newsletter.test.ts 3/3 GREEN |

**Score:** 11/11 code-layer truths VERIFIED

4 additional truths require operator deploy confirmation before SC #1-#3 can be declared live-observable (see Human Verification items 1-6). SC #4 is an operator acquisition milestone requiring subscriber count confirmation before Phase 5 entry (human item #10).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `workers/digest/src/index.ts` | Digest worker main handler (347+ lines) | VERIFIED | 347 lines; strict TS; tsc --noEmit clean |
| `workers/digest/package.json` | Workspace deps: @owljobs/niches, @supabase/supabase-js | VERIFIED | Both deps present |
| `workers/digest/tsconfig.json` | Extends tsconfig.base; @cloudflare/workers-types | VERIFIED | Confirmed |
| `workers/digest/wrangler.toml` | name=owljobs-digest; cron 0 6 * * 1; DIGEST_QUEUE binding; max_batch_size=1 | VERIFIED | All 4 values confirmed |
| `workers/digest/test/digest.test.ts` | 14 source-contract assertions (CAND-01, CAND-02) | VERIFIED | 14/14 GREEN |
| `workers/digest/test/idempotency.test.ts` | 4 source-contract assertions (CAND-03) | VERIFIED | 4/4 GREEN |
| `packages/schema/src/migrations/0006_email_sends_idempotency.sql` | UNIQUE(subscriber_id, sent_date, type) + sent_date DATE NOT NULL | VERIFIED | Constraint present; wind_turbine placeholder correct |
| `apps/web/src/pages/api/unsubscribe.ts` | Both handlers: soft-delete, token in URL searchParams, POST 200 OK unconditional | VERIFIED | 2x .update confirmed; 2x searchParams confirmed; no .delete() |
| `apps/web/test/unsubscribe.test.ts` | 8 source-contract assertions (CAND-02) | VERIFIED | 8/8 GREEN |
| `apps/web/src/components/Newsletter.astro` | "420+ jobs from 20+ employers" social proof | VERIFIED | Present |
| `apps/web/test/newsletter.test.ts` | 3 assertions (CAND-04 D-12) | VERIFIED | 3/3 GREEN |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `scheduled()` | DIGEST_QUEUE | `DIGEST_QUEUE.send({nicheId, subscriberIds})` | VERIFIED | Confirmed in index.ts; wrangler.toml binding present |
| `queue()` consumer | Resend `/emails/batch` | `fetch("https://api.resend.com/emails/batch", ...)` | VERIFIED | URL confirmed at line ~305 |
| `queue()` consumer | `email_sends` table | Supabase `.insert({subscriber_id, sent_date, type})` BEFORE fetch | VERIFIED | Insert line 280 < Resend call line 305 |
| `queue()` consumer | `subscribers` table | `.not("confirmed_at", "is", null)` filter | VERIFIED | Filter present in both scheduled() and queue() handlers |
| `List-Unsubscribe-Post` header | `/api/unsubscribe` POST endpoint | `buildUnsubscribeUrl()` at line 80 | VERIFIED | URL template: `https://${niche.domain}/api/unsubscribe?token=${encodeURIComponent(token)}` |
| `/api/unsubscribe` GET+POST | `wind_turbine.subscribers` | `.update({ confirmed_at: null }).eq('unsubscribe_token', token)` | VERIFIED | 2 `.update` calls confirmed; schema from `niche.supabaseSchema` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `workers/digest/src/index.ts` `scheduled()` | `niches` | `getAllNiches()` from `@owljobs/niches` | Yes — registry-backed | FLOWING |
| `workers/digest/src/index.ts` `queue()` | `subscribers` | Supabase `wind_turbine.subscribers` WHERE confirmed_at IS NOT NULL | Yes — live DB query (pending db push in production) | FLOWING |
| `workers/digest/src/index.ts` `queue()` | `jobs` | Supabase `wind_turbine.jobs` WHERE status='active' AND created_at >= 7 days ago | Yes — live DB query | FLOWING |
| `apps/web/src/components/Newsletter.astro` | static copy | Hard-coded "420+" string | N/A — intentionally static | VERIFIED |

### Behavioral Spot-Checks

Step 7b: SKIPPED for live cron/queue behavior — requires deployed Worker + Cloudflare credentials. Source-contract tests serve as the equivalent static behavioral check.

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Digest test suite (14 assertions) | `pnpm test --run workers/digest/test/digest.test.ts` | 14/14 GREEN | PASS |
| Idempotency test suite (4 assertions) | `pnpm test --run workers/digest/test/idempotency.test.ts` | 4/4 GREEN | PASS |
| Unsubscribe test suite (8 assertions) | `pnpm test --run apps/web/test/unsubscribe.test.ts` | 8/8 GREEN | PASS |
| Newsletter test suite (3 assertions) | `pnpm test --run apps/web/test/newsletter.test.ts` | 3/3 GREEN | PASS |
| TypeScript (web) | `cd apps/web && pnpm exec tsc --noEmit` | exit 0 | PASS |
| TypeScript (digest) | `cd workers/digest && pnpm exec tsc --noEmit` | exit 0 | PASS |
| Live weekly digest delivery | Requires deployed Worker | N/A | SKIP (human item #1) |
| RFC 8058 one-click in Gmail/Outlook | Requires deployed endpoint + real email | N/A | SKIP (human items #2-3) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| CAND-01 | 03-02-PLAN.md | Weekly digest worker: cron to queue to Resend batch | SATISFIED (code) | `scheduled()` enqueues; `queue()` sends to Resend batch; digest.test.ts 14/14 GREEN |
| CAND-02 | 03-03-PLAN.md, 03-02-PLAN.md | RFC 8058 List-Unsubscribe + one-click POST; soft-delete unsubscribe | SATISFIED (code) | `List-Unsubscribe-Post` at line 319; both handlers soft-delete; unsubscribe.test.ts 8/8 GREEN |
| CAND-03 | 03-01-PLAN.md, 03-02-PLAN.md | DB idempotency UNIQUE(subscriber_id, sent_date, type); insert-before-send | SATISFIED (code; pending supabase db push to activate constraint in production) | Migration 0006 exists; insert at line 280 < send at line 305; 23505 catch-and-continue confirmed |
| CAND-04 | 03-04-PLAN.md | ≥100 confirmed subscribers (hard gate) | PENDING OPERATOR ACTION | D-12 social proof shipped; subscriber count gate enforced at Phase 5 entry per ROADMAP Notes |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `apps/web/src/components/ui/Input.astro` | 17 | ts(2322) type narrowing error (`type` prop) | Info | Pre-existing since initial commit; not touched by Phase 3; deferred to Phase 4 cleanup per deferred-items.md |
| `apps/web/src/components/FeaturedJobCard.astro` | 21 | ts(6133) unused variable `applyUrl` | Info | Pre-existing; deferred to Phase 4 cleanup |
| `apps/web/src/components/JobCardModern.astro` | 2 | ts(6133) unused variable `Badge` | Info | Pre-existing; deferred to Phase 4 cleanup |

No Phase-3-introduced anti-patterns found. All three `astro check` diagnostics are pre-existing from the initial commit and correctly captured in `deferred-items.md`.

### Human Verification Required

#### 1. Weekly Digest Delivery (SC #1)

**Test:** After completing the operator deploy gates (supabase db push + wrangler deploy in workers/digest + secrets set), trigger the cron manually via `wrangler cron trigger owljobs-digest` or wait for 06:00 UTC Monday. Confirm a confirmed subscriber receives an email.
**Expected:** Email arrives from the configured Resend sending domain; contains only jobs created in the past 7 days; includes a working List-Unsubscribe link.
**Why human:** Live Cloudflare Worker + Supabase + Resend required; cron cannot be exercised without deployment.

#### 2. RFC 8058 GET Unsubscribe in Real Mail Client (SC #2)

**Test:** Click the List-Unsubscribe link in a received digest email in Gmail or Outlook.
**Expected:** Browser navigates to `/api/unsubscribe?token=...`; Supabase row shows `confirmed_at = NULL`; user can re-subscribe cleanly.
**Why human:** Requires a real mail client and a live sent email with a token-bearing URL.

#### 3. RFC 8058 One-Click POST Unsubscribe in Gmail/Outlook (SC #2)

**Test:** Use Gmail or Outlook's "Unsubscribe" button (triggers RFC 8058 POST) on a received digest.
**Expected:** Mail client POSTs to `/api/unsubscribe?token=...`; endpoint returns HTTP 200; subscriber row has `confirmed_at = NULL`.
**Why human:** RFC 8058 POST is issued by the mail client infrastructure, not a manual request.

#### 4. Idempotency — Live DB Replay (SC #3)

**Test:** Trigger the digest worker twice on the same day (via `wrangler cron trigger` or equivalent). Inspect `email_sends` rows.
**Expected:** Exactly one row per subscriber per `(sent_date, type = 'digest')`; second invocation logs 23505 skips; Resend is not called twice per subscriber.
**Why human:** Requires deployed Worker and migration 0006 active in production Supabase.

#### 5. supabase db push — Migration 0006

**Test:** Run `supabase db push` from RUNBOOK.md with the production project ref.
**Expected:** `0006_email_sends_idempotency.sql` applies cleanly; `\d email_sends` in psql shows `email_sends_subscriber_date_type_key` UNIQUE constraint.
**Why human:** Operator task requiring Supabase project credentials. See RUNBOOK.md.

#### 6. workers/digest Deployment

**Test:** Run `wrangler deploy` in `workers/digest/`. Set DIGEST_QUEUE binding, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY as Worker secrets. Confirm worker appears in Cloudflare dashboard with cron `0 6 * * 1`.
**Expected:** Worker deployed; cron trigger visible; no binding errors on invocation.
**Why human:** Requires Cloudflare account credentials and Resend API key.

#### 7. No HTTP Surface Verification (T-03-04)

**Test:** `curl -X GET https://owljobs-digest.{account}.workers.dev/` against the deployed worker.
**Expected:** Connection refused, 405, or similar — confirming no `fetch` handler is exported.
**Why human:** Requires deployed worker URL.

#### 8. GDPR Re-Subscribe After Soft-Unsubscribe

**Test:** Unsubscribe a test subscriber (GET or POST to /api/unsubscribe), then re-submit the subscribe form with the same email. Click the confirmation email link.
**Expected:** No duplicate row created; existing row has `confirmed_at` repopulated; subscriber begins receiving digests again.
**Why human:** Round-trip through Astro frontend + Supabase + Resend; requires live deployment.

#### 9. Zero-Jobs Week Digest Rendering

**Test:** Create test conditions where no new jobs exist in the past 7 days for a niche. Trigger digest worker.
**Expected:** Email still sent (D-03 decision); email body shows a no-new-jobs message; no empty/broken template delivered.
**Why human:** Requires live Worker + real email rendering in mail client.

#### 10. SC #4 Hard Gate — ≥100 Confirmed Subscribers

**Test:** Run `SELECT COUNT(*) FROM wind_turbine.subscribers WHERE confirmed_at IS NOT NULL` against the production Supabase database.
**Expected:** Count >= 100 before Phase 5 (Monetization & Outreach) can begin.
**Why human:** Operator acquisition milestone. The code mechanism (D-12 social proof copy in Newsletter.astro) shipped in Plan 03-04. The subscriber count must be confirmed by the operator at Phase 5 entry per ROADMAP hard-gate rule. Not a code deliverable — no closure plan needed, just operator confirmation.

#### 11. STATE.md CAND-04 Active Todos Bullet

**Test:** Open `.planning/STATE.md` and confirm an Active Todos entry exists for CAND-04 outreach milestone tracking.
**Expected:** A bullet similar to "CAND-04 outreach: begin candidate acquisition campaign toward 100 confirmed subscribers (hard gate for Phase 5)" is present in the Active Todos section.
**Why human:** Plan 03-04 Task 3 was a `checkpoint:human-action` deliberately deferred from the worktree executor (scope-boundary rule). One-line markdown append for the orchestrator to add before closing Phase 3.

### Gaps Summary

No code-layer gaps. All 11 code-layer truths are VERIFIED. All Phase-3-introduced test suites pass (29/29 total assertions GREEN). TypeScript is clean in both `apps/web` and `workers/digest`.

The phase is blocked on human verification for operator deploy gates (supabase db push + wrangler deploy) before SC #1, #2, and #3 can be confirmed live-observable. SC #4 (≥100 confirmed subscribers) is an operator acquisition milestone requiring a Supabase count check at Phase 5 entry (not a deferred code item).

Two administrative items require orchestrator action before Phase 3 can be closed: STATE.md CAND-04 outreach bullet (human item #11) and Phase 5 entry gate confirmation (human item #10).

---

_Verified: 2026-05-12T03:30:00Z_
_Verifier: Claude (gsd-verifier)_
