---
phase: 03-candidate-activation
reviewed: 2026-05-12T00:00:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - packages/schema/src/migrations/0006_email_sends_idempotency.sql
  - workers/digest/test/digest.test.ts
  - workers/digest/test/idempotency.test.ts
  - workers/digest/package.json
  - workers/digest/tsconfig.json
  - workers/digest/wrangler.toml
  - workers/digest/src/index.ts
  - apps/web/test/unsubscribe.test.ts
  - apps/web/src/pages/api/unsubscribe.ts
  - apps/web/test/newsletter.test.ts
  - apps/web/src/components/Newsletter.astro
findings:
  critical: 3
  warning: 4
  info: 0
  total: 7
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-05-12
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

Reviewed the Phase 3 candidate-activation implementation: digest worker (cron, queue, Resend batch), idempotency migration, unsubscribe endpoint, and newsletter form. The architecture is broadly correct — insert-before-send idempotency, niche-registry pattern, RFC 8058 headers, soft-delete unsubscribe. However one BLOCKER makes the idempotency design self-defeating: a Resend batch failure causes permanent email loss because the retry path finds all `email_sends` rows already inserted and skips every subscriber. Two additional BLOCKERs cover an unstable pagination cursor and a migration UNIQUE constraint that can fail on non-empty tables.

---

## Critical Issues

### CR-01: Insert-before-send causes permanent email loss on Resend batch failure

**File:** `workers/digest/src/index.ts:282-349`

**Issue:** The `for (const sub of subs)` loop inserts an `email_sends` row for each subscriber *before* appending to `batchPayload`. A single `POST /emails/batch` fires after the loop completes. If Resend returns a non-2xx (line 337-340), the catch block calls `msg.retry()` (line 349). On redelivery every insert hits unique-violation `23505` → `continue` → subscriber skipped → `batchPayload` is empty → no send. The comment on lines 346-347 explicitly says "DB UNIQUE constraint protects already-sent subscribers from duplicate emails on the retry pass" — this is backwards: the constraint *prevents* the retry from sending at all.

Net: up to 10 subscribers permanently marked as "sent" with zero emails delivered. No recovery path.

**Fix:** Either (a) move the Resend call *inside* the per-subscriber loop (1 send per insert) so a Resend failure for subscriber N does not suppress subscriber N+1; or (b) use a two-phase pattern — accumulate the batch, send it, only insert `email_sends` rows for entries Resend confirms as accepted (parse the per-message ids/errors from the batch response). Option (a) is simpler and keeps the guard correct:

```typescript
// Inside for (const sub of subs) { ... }, after insertError guard passes:
const res = await fetch("https://api.resend.com/emails/batch", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${env.RESEND_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify([{
    from: FROM_ADDRESS,
    to: sub.email,
    subject: buildSubject(subJobs.length, niche),
    html: renderDigestHtml(subJobs, sub, niche, employerNameById),
    text: renderDigestText(subJobs, sub, niche),
    headers: {
      "List-Unsubscribe": `<${buildUnsubscribeUrl(niche, sub.unsubscribe_token)}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  }]),
});
if (!res.ok) {
  // Roll back or leave the insert (UNIQUE constraint handles dedupe on retry)
  // Log and continue — other subscribers still get their email.
  console.error(`[${nicheId}] Resend failed for ${sub.id}: ${res.status}`);
  continue;
}
```

If batching is required for throughput, option (b): send the batch, then use the per-message results from Resend's response to insert only the successful rows.

---

### CR-02: Subscriber pagination has no ORDER BY — subscribers can be missed or double-counted

**File:** `workers/digest/src/index.ts:185-199`

**Issue:** The cron handler paginates subscribers with `.range(offset, offset + BATCH_SIZE - 1)` but no `.order()`. PostgREST/Supabase does not guarantee stable row order across paginated requests without an explicit ORDER BY. Any INSERT or autovacuum activity between cron iterations can shift rows, causing some subscribers to be delivered to twice (duplicate queue messages) or skipped entirely. With thousands of subscribers this is a weekly data correctness bug.

**Fix:** Add a deterministic `.order()` before `.range()`:

```typescript
const { data, error } = await db
  .from("subscribers")
  .select("id")
  .not("confirmed_at", "is", null)
  .order("id", { ascending: true })   // ← add this
  .range(offset, offset + BATCH_SIZE - 1);
```

---

### CR-03: Migration UNIQUE constraint fails if email_sends table has pre-existing rows for the same subscriber on the same day

**File:** `packages/schema/src/migrations/0006_email_sends_idempotency.sql:17-23`

**Issue:** The migration backfills `sent_date DEFAULT CURRENT_DATE` and `type DEFAULT 'digest'` for every existing row in `email_sends`, then adds a `UNIQUE (subscriber_id, sent_date, type)` constraint. If any subscriber has two or more rows in `email_sends` (e.g. from test sends or any prior send on the same date), the constraint creation will fail with:

```
ERROR:  could not create unique index "email_sends_subscriber_date_type_key"
DETAIL:  Key (subscriber_id, sent_date, type)=(…, 2026-05-12, digest) is duplicated.
```

This is a BLOCKER if `email_sends` already contains data. The migration provides no deduplication step before adding the constraint.

**Fix:** Either add a `DELETE` deduplication CTE before the constraint, or use a `NOT VALID` constraint with a subsequent `VALIDATE CONSTRAINT` after cleanup:

```sql
-- Option A: deduplicate first (keep the most recent row per subscriber+date+type)
DELETE FROM wind_turbine.email_sends a
USING wind_turbine.email_sends b
WHERE a.subscriber_id = b.subscriber_id
  AND a.sent_date = b.sent_date
  AND a.type      = b.type
  AND a.id < b.id;  -- keep the row with the higher id

ALTER TABLE wind_turbine.email_sends
  ADD CONSTRAINT email_sends_subscriber_date_type_key
    UNIQUE (subscriber_id, sent_date, type);
```

If the table is guaranteed empty in production today, downgrade to WARNING; but the migration itself provides no guard and must be run in a wider window of niches over time.

---

## Warnings

### WR-01: GET /api/unsubscribe leaks token validity — inconsistent with POST

**File:** `apps/web/src/pages/api/unsubscribe.ts:26-36`

**Issue:** The GET handler returns different HTML content depending on whether the token matched a row (`data` present vs. `error || !data`). An attacker can probe arbitrary token strings and distinguish "token found and nulled" from "token not found" by inspecting the response body ("You're unsubscribed" vs. "Already unsubscribed / invalid"). This is the same enumeration side-channel T-03-01 that the POST handler explicitly closes. CLAUDE.md hardcodes the POST as "no enumeration side-channel" — GET has no equivalent protection.

**Fix:** Return the same page text regardless of whether the token matched, or always return 200 with the same "You're unsubscribed" message (since the desired end-state is identical whether the token was already nulled or just now nulled):

```typescript
// After the .update().eq().single() call, ignore the error/not-found branch
// and always return the "unsubscribed" page:
return new Response(
  `<!doctype html>...You're unsubscribed...`,
  { status: 200, headers: { "Content-Type": "text/html" } },
);
```

---

### WR-02: No dead-letter queue — failed digests vanish silently

**File:** `workers/digest/wrangler.toml:21-23`

**Issue:** `max_retries = 2`. After 3 total attempts (1 original + 2 retries), Cloudflare Queues drops the message. There is no `dead_letter_queue` binding. Combined with CR-01, a Resend outage lasting more than 3 retry windows permanently silences affected subscribers with no observable artifact. Operators have no way to replay or audit lost messages.

**Fix:** Add a dead-letter queue:

```toml
[[queues.consumers]]
queue = "owljobs-digest"
max_batch_size = 1
max_batch_timeout = 0
max_retries = 2
dead_letter_queue = "owljobs-digest-dlq"   # ← add this
```

Create the DLQ with `wrangler queues create owljobs-digest-dlq`. Add a separate consumer or monitoring alert on the DLQ binding.

---

### WR-03: Hardcoded brand color `#1a6b3c` in unsubscribe HTML responses

**File:** `apps/web/src/pages/api/unsubscribe.ts:32,43`

**Issue:** Both response branches use the literal hex `#1a6b3c` for the back-link color. This hardcodes Wind Turbine Jobs' brand color into a shared endpoint that must work across all niches (CLAUDE.md multi-niche hard rule). A new niche will render the wrong brand color.

**Fix:** Use `niche.branding.primaryColor` which is already in scope via `const { niche } = locals`:

```typescript
<a href="/" style="color:${niche.branding.primaryColor}">← Back to ${niche.name}</a>
```

---

### WR-04: workers/digest/package.json has no test script despite shipping vitest tests

**File:** `workers/digest/package.json:1-11`

**Issue:** The package ships two test files under `test/` but defines no `"test"` script. Running `pnpm test` from the workspace root or from `workers/digest/` will not execute these tests. The idempotency and digest source-contract tests will be silently skipped in CI.

**Fix:** Add a test script (and vitest as a dev dependency):

```json
{
  "scripts": {
    "test": "vitest run"
  },
  "devDependencies": {
    "vitest": "^1.6.0"
  }
}
```

---

_Reviewed: 2026-05-12_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
