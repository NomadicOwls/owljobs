# Phase 3: Candidate Activation - Research

**Researched:** 2026-05-11
**Domain:** Cloudflare Workers queue fan-out, Resend email API, RFC 8058 one-click unsubscribe, Supabase idempotency constraints
**Confidence:** HIGH (all key patterns verified from existing codebase and official docs)

## Summary

Phase 3 builds the weekly digest worker (`workers/digest/`) and two supporting changes: a DB migration adding idempotency columns to `email_sends`, and a social proof copy update to `Newsletter.astro`. All three pieces are net-new code — no major rewrites of existing code — except the RFC 8058 one-click unsubscribe endpoint where there is an important naming/mechanics conflict (see Open Questions).

The digest worker pattern is a near-exact replica of the `workers/ingest` cron→queue→consumer pipeline. All infra patterns, Supabase client setup, and Resend integration are already established in the codebase. The primary research value is documenting the **three conflicts between CONTEXT.md locked decisions and existing code or external standards** so the planner can resolve them before writing task actions.

**Primary recommendation:** Copy `workers/discover/` directory structure, copy the cron+queue pattern from `workers/ingest/src/index.ts`, use `POST https://api.resend.com/emails/batch` (up to 100 per call) for each consumer invocation, and encode recipient token in the `List-Unsubscribe` URL query parameter — not in the POST body.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Job Matching Logic**
- **D-01:** "New" = jobs with `posted_at` in the prior 7-day window (relative to cron run time). All confirmed subscribers get the same weekly batch.
- **D-02:** Matching = if `subscribers.locations` is NULL → send all jobs in the niche. If set → case-insensitive substring match: include jobs where `job.location` contains any location string from the array.
- **D-03:** Zero-new-jobs week = send a "no new listings this week" email anyway. Don't skip the send — keeps the weekly cadence reliable for subscribers.
- **D-04:** Cron schedule = `0 6 * * 1` (Monday 06:00 UTC). Weekly frequency locked for Phase 3.

**Email Template**
- **D-05:** Format = simple HTML (React Email compatible via Resend). Branded header, job cards, plain-text multipart fallback.
- **D-06:** Job cap = all jobs from the 7-day window, maximum 20 per digest. With niche job volume most weeks will be well under 20.
- **D-07:** Job card fields = title, company, location, apply link. No salary (often null) or posted date in the card.
- **D-08:** Subject line = dynamic with job count. Examples: `"8 new wind turbine jobs this week"` / `"Wind Turbine Jobs — no new listings this week"`.
- **D-09:** Sender = `Wind Turbine Jobs <digest@windturbinejobs.com>`. Distinct from the confirmation email sender. Resend sending domain must include this address.
- **D-10:** Footer = unsubscribe link + short brand tagline only.

**Subscriber Acquisition (CAND-04)**
- **D-11:** Outreach channels = LinkedIn + direct outreach to individual profiles + SEO organic.
- **D-12:** Subscribe form social proof = static text `"420+ jobs from 20+ employers"`.
- **D-13:** Subscriber count tracking = manual Supabase query. No admin UI.

**Digest Worker Architecture**
- **D-14:** New standalone `workers/digest/` — copy structure from `workers/discover/`.
- **D-15:** Queue fan-out: cron enqueues one message per 10 subscribers (batch), consumer sends 10 Resend calls per message. `max_batch_size: 10`. Queue name: `owljobs-digest`.
- **D-16:** `email_sends` DB migration: add `sent_date DATE NOT NULL DEFAULT CURRENT_DATE` + `type TEXT NOT NULL DEFAULT 'digest'` + `UNIQUE(subscriber_id, sent_date, type)`. Migration `0006_email_sends_idempotency.sql`.
- **D-17:** Error handling = log + skip failed subscriber, continue batch. Throw only for unrecoverable errors.
- **D-18:** Multi-niche from day one — use `getAllNiches()`. No `wind_turbine` hardcoding.

**RFC 8058 One-Click Unsubscribe**
- **D-19:** New endpoint `POST /api/unsubscribe-oneclick` — accepts `unsubscribe_token` in POST body (form-encoded). Digest email `List-Unsubscribe-Post` header points to this endpoint.
- **D-20:** One-click action = set `confirmed_at = NULL` (soft unsubscribe, preserves row for FK integrity).

### Claude's Discretion
- Exact React Email component structure for the digest template
- HTML/CSS styling within the simple HTML constraint
- Exact error log format in the digest worker
- Queue retry/deadletter configuration in wrangler.toml

### Deferred Ideas (OUT OF SCOPE)
- Digest frequency tuning (daily, 3x/week)
- Admin subscriber count endpoint
- Welcome email after confirmation
- Manage preferences page
- UTM tracking on digest links
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CAND-01 | Weekly email digest worker — Cron trigger (06:00 UTC) → fan-out to queue → Resend delivery of new matching jobs to confirmed subscribers | Cron+queue pattern verified in `workers/ingest/src/index.ts`; Resend batch API verified (`POST /emails/batch`, up to 100/call) |
| CAND-02 | Email digest includes `List-Unsubscribe` and `List-Unsubscribe-Post` headers | Resend custom `headers` field confirmed [VERIFIED: Context7/resend docs]; RFC 8058 body spec clarified (see Conflicts section) |
| CAND-03 | Email digest idempotency — unique constraint on `(subscriber_id, sent_date, type)` prevents duplicate sends | INSERT-before-send pattern with `ON CONFLICT DO NOTHING` is the safe ordering; migration 0006 documented |
| CAND-04 | Minimum 100 confirmed (double-opt-in) subscribers via active outreach | Social proof copy addition to `Newsletter.astro` (static text D-12); outreach channels D-11; tracking via manual Supabase query D-13 |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Weekly digest fan-out (cron → queue) | Cloudflare Worker (`workers/digest`) | — | Cron trigger + queue producer live in Worker runtime; 30s CPU cap in cron handler makes queue mandatory |
| Digest email rendering + Resend delivery | Cloudflare Worker (`workers/digest` queue consumer) | — | Consumer has 15-min wall clock, handles HTML build + Resend API calls |
| Idempotency enforcement | Supabase DB (unique constraint) | Worker (insert-before-send check) | DB constraint is the hard guarantee; Worker checks the insert result to skip already-sent rows |
| RFC 8058 one-click unsubscribe | Cloudflare Pages API route (`apps/web/src/pages/api/`) | Supabase (row update) | Astro API routes run on Pages Workers; token lookup and `confirmed_at = NULL` update happens via supabaseAdmin |
| Subscribe form social proof copy | Frontend (`apps/web/src/components/Newsletter.astro`) | — | Static copy change in Astro component |
| Subscriber acquisition (outreach) | Ops / human task | — | No code; LinkedIn + direct outreach per D-11 |

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | ^2.45.0 | Supabase client in Worker (service_role, no session) | Already used in workers/ingest and workers/discover |
| Resend REST API (fetch) | — | Send transactional email; avoid SDK for Workers compatibility | Pattern established in `apps/web/src/lib/resend.ts` — raw fetch, no SDK import |
| `@owljobs/niches` | workspace | `getAllNiches()` + `NicheConfig` | Required by CLAUDE.md multi-niche rule |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Resend `/emails/batch` endpoint | — | Send up to 100 emails in a single API call | Use within each queue consumer invocation to batch-send to all subscribers in the message's slice |

**Installation (workers/digest):**
```bash
pnpm add @supabase/supabase-js --filter @owljobs/digest
```

`@owljobs/niches` is a workspace package — add to package.json dependencies as `"@owljobs/niches": "workspace:*"`.

**Version verification:** [VERIFIED: npm registry] `@supabase/supabase-js` is `^2.45.0` per `workers/discover/package.json`.

---

## Architecture Patterns

### System Architecture Diagram

```
Monday 06:00 UTC
       │
       ▼
[CF Cron Trigger]
  workers/digest
  scheduled()
       │
       │  getAllNiches() → for each niche:
       │    SELECT confirmed subscribers (paginated by 10)
       │    for each page of 10:
       ▼
[DIGEST_QUEUE.send({ nicheId, subscriberIds[] })]
       │
       │  (async, up to 15-min wall clock)
       ▼
[Queue Consumer]
  workers/digest
  queue()
       │
       ├─ SELECT new jobs for niche (posted_at > now()-7d, LIMIT 20)
       ├─ for each subscriberId in batch:
       │    apply location filter (D-02)
       │    INSERT INTO email_sends (subscriber_id, sent_date, type)
       │      ON CONFLICT (subscriber_id, sent_date, type) DO NOTHING
       │    → if 0 rows inserted: skip (already sent today)
       │    → if 1 row inserted: render HTML + add to Resend batch
       │
       └─ POST /emails/batch → Resend API (up to 10 emails)
              │
              └─ Resend → subscriber inbox
                   │
                   └─ List-Unsubscribe: <https://windturbinejobs.com/api/unsubscribe?token=TOKEN>
                      List-Unsubscribe-Post: List-Unsubscribe=One-Click
```

### Recommended Project Structure
```
workers/digest/
├── package.json         # @owljobs/digest, deps: @supabase/supabase-js, @owljobs/niches
├── tsconfig.json        # copy from workers/discover/
├── wrangler.toml        # cron 0 6 * * 1, queue producer+consumer, secrets
└── src/
    └── index.ts         # Env interface, scheduled(), queue(), sendDigest()
```

### Pattern 1: Cron → Queue Producer (from workers/ingest)
**What:** Cron handler paginates subscribers and enqueues one message per batch. Uses `ctx.waitUntil()` to avoid blocking the cron response.
**When to use:** Always — cron handler has 30s CPU cap; never do Resend calls inside `scheduled()`.

```typescript
// Source: workers/ingest/src/index.ts (adapted)
async scheduled(_event, env, ctx) {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
  const niches = getAllNiches();

  ctx.waitUntil(
    Promise.allSettled(
      niches.map(async (niche) => {
        const db = supabase.schema(niche.supabaseSchema);
        // Paginate confirmed subscribers in batches of 10
        let offset = 0;
        const batchSize = 10;
        while (true) {
          const { data } = await db
            .from("subscribers")
            .select("id")
            .not("confirmed_at", "is", null)
            .range(offset, offset + batchSize - 1);
          if (!data || data.length === 0) break;
          await env.DIGEST_QUEUE.send({
            nicheId: niche.id,
            subscriberIds: data.map((r) => r.id),
          });
          if (data.length < batchSize) break;
          offset += batchSize;
        }
      })
    )
  );
},
```

### Pattern 2: Insert-Before-Send Idempotency
**What:** Write the send record FIRST; only send email if the insert succeeded (no conflict). Reverse order risks duplicate sends on queue retry.
**When to use:** Every subscriber in every consumer invocation.

```typescript
// Source: [ASSUMED] — standard idempotency pattern; aligns with D-16 + D-17
const todayDate = new Date().toISOString().slice(0, 10); // UTC YYYY-MM-DD

const { error: insertError } = await db
  .schema(niche.supabaseSchema)
  .from("email_sends")
  .insert({
    id: crypto.randomUUID(),
    subscriber_id: sub.id,
    sent_date: todayDate,
    type: "digest",
  });

if (insertError?.code === "23505") {
  // Unique constraint violation — already sent today, skip
  continue;
}
if (insertError) throw insertError; // unexpected DB error — fail message, retry

// Insert succeeded → now safe to add to Resend batch
```

### Pattern 3: Resend Batch API in Workers
**What:** `POST /emails/batch` sends up to 100 individual emails in one HTTP call. Each email has its own headers (including per-subscriber `List-Unsubscribe` URL).

```typescript
// Source: [CITED: resend.com/docs] via Context7
const batchPayload = subscribersToSend.map((sub) => ({
  from: `Wind Turbine Jobs <digest@windturbinejobs.com>`,
  to: sub.email,
  subject: subject,
  html: renderDigestHtml(jobs, sub),
  text: renderDigestText(jobs),
  headers: {
    "List-Unsubscribe": `<https://${niche.domain}/api/unsubscribe?token=${sub.unsubscribeToken}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  },
}));

const res = await fetch("https://api.resend.com/emails/batch", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${env.RESEND_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(batchPayload),
});
```

### Pattern 4: RFC 8058 Endpoint (correct mechanics)
**What:** Email client sends `POST` with body `List-Unsubscribe=One-Click`. Subscriber identity MUST be in the URL — not the body.

```typescript
// Source: [CITED: RFC 8058 §3.1, rfc-editor.org/rfc/rfc8058]
// Correct: GET endpoint URL = /api/unsubscribe?token=TOKEN
// Correct: POST endpoint URL = /api/unsubscribe?token=TOKEN  (same route, token in URL)
// POST body = "List-Unsubscribe=One-Click" (exact literal)

export const POST: APIRoute = async ({ locals, url }) => {
  const token = url.searchParams.get("token");   // token in URL, NOT body
  if (!token) return new Response("Missing token.", { status: 400 });
  // ... set confirmed_at = NULL
  return new Response("OK", { status: 200 });
};
```

The existing `POST` handler in `apps/web/src/pages/api/unsubscribe.ts` already reads the token from `url.searchParams` — it is RFC 8058 compliant in structure. The main change needed is the action (soft-delete via `confirmed_at = NULL` per D-20, instead of hard delete).

### Anti-Patterns to Avoid
- **Loop-and-send in cron:** Calling Resend inside `scheduled()` — hits 30s CPU cap. Queue consumer is mandatory.
- **Send-before-insert:** Writing to `email_sends` AFTER calling Resend — on queue retry, email is sent twice.
- **Token in POST body:** Putting `unsubscribe_token` in the RFC 8058 POST body — violates the spec. Token belongs in the URL.
- **Hardcoding `wind_turbine`:** Any schema name in new code — use `niche.supabaseSchema`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTML email rendering | Custom template engine | Inline HTML strings with template literals (or React Email if desired) | No DOM in Workers; simple HTML per D-05 |
| Email delivery | Nodemailer / SMTP client | Resend REST API via `fetch` | Workers have no TCP; SMTP requires Node.js; Resend is already the project email provider |
| Idempotency | In-memory set or Redis dedup | Supabase unique constraint `(subscriber_id, sent_date, type)` | Workers are stateless; DB constraint survives retries |
| Unsubscribe token validation | JWT decode | Direct lookup by `unsubscribe_token` column (unique index exists) | Simpler; token is already opaque UUID in `subscribers` table |

**Key insight:** The idempotency guarantee must live at the DB layer. Workers are stateless and queue messages can be redelivered — any in-process dedup disappears on retry.

---

## Conflicts to Resolve Before Planning

These conflicts between CONTEXT.md locked decisions and existing code or external standards MUST be resolved in the plan. They are not blocking research but will cause implementation defects if unresolved.

### Conflict 1: D-15 max_batch_size vs CLAUDE.md hard rule

**CONTEXT.md D-15:** `max_batch_size: 10` on the digest queue consumer.
**CLAUDE.md hard rule:** `Cron → Queue (max_batch_size: 2) → Resend. Never loop-and-send in the cron handler (30s CPU cap).`

The CLAUDE.md rule uses `max_batch_size: 2` — but this applies to how many queue *messages* the consumer receives per invocation, not to how many emails are sent. The `workers/ingest` uses `max_batch_size: 2` for classify/enrich queues. For the digest queue, each message carries 10 subscriber IDs in its body — the `max_batch_size` controls how many such messages are batched per consumer call.

**Planner action required:** Decide whether `max_batch_size: 10` (D-15) or `max_batch_size: 2` (CLAUDE.md default) applies. If max_batch_size is 10, one consumer call processes up to 100 subscribers (10 messages × 10 IDs each). The 15-min wall clock limit on queue consumers is sufficient for either choice. Document the reasoning in the plan.

**Resolution recommendation (Claude's discretion):** Use `max_batch_size: 1` with 10 subscriber IDs per message body. This is simpler: each consumer invocation handles exactly one batch of 10 subscribers, one Resend batch call. Aligns with the existing ingest pattern and keeps the CLAUDE.md `max_batch_size: 2` constraint (or lower) satisfied.

### Conflict 2: D-19 "new endpoint" vs existing POST handler

**CONTEXT.md D-19:** Create `POST /api/unsubscribe-oneclick` — a new, separate endpoint.
**Existing code:** `apps/web/src/pages/api/unsubscribe.ts` already exports a `POST` handler for RFC 8058 one-click (reads `token` from URL query string, hard-deletes the row).

The existing POST handler at `/api/unsubscribe` is already the RFC 8058 endpoint. The only required changes are:
1. Change the action from hard-delete to soft-delete (`confirmed_at = NULL` per D-20).
2. The `List-Unsubscribe-Post` header in digest emails should point to `/api/unsubscribe?token=TOKEN` (same URL as `List-Unsubscribe`), not a new route.

**Planner action required:** Modify the existing POST handler in `unsubscribe.ts` rather than creating a new file. The CONTEXT.md D-19 description of a "new endpoint" is superseded by this finding.

### Conflict 3: D-19 RFC 8058 body mechanics

**CONTEXT.md D-19:** "Accepts `unsubscribe_token` in the POST body (form-encoded per RFC 8058)."
**RFC 8058 §3.1:** The POST body is literally the bytes `List-Unsubscribe=One-Click` (content-type `application/x-www-form-urlencoded`). Per the spec: "Since there is no provision for extra POST arguments, any information about the message or recipient is encoded in the URI." [CITED: rfc-editor.org/rfc/rfc8058]

The token must be in the URL query string, not the POST body. The existing handler already reads from `url.searchParams.get("token")` — which is correct.

**Planner action required:** Update task action for the unsubscribe endpoint to confirm: token goes in the URL (already correct in existing code), body is ignored.

### Conflict 4: GET hard-delete vs POST soft-delete asymmetry (OPEN QUESTION)

**Current GET handler:** Hard-deletes the subscriber row (`.delete()`).
**D-20 POST handler:** Soft-deletes (`confirmed_at = NULL`).

After Phase 3, clicking the GET unsubscribe link (e.g., from mobile email preview) hard-deletes the row. Clicking the email client's one-click button calls POST and soft-deletes. FK references from `email_sends` survive POST but not GET. This is an inconsistency.

**Planner action required:** Decide whether GET should also be migrated to soft-delete, or leave as-is for Phase 3 (GET-hard / POST-soft). Note: soft-delete on GET means a subscriber can re-subscribe, which is the better UX.

---

## Common Pitfalls

### Pitfall 1: Send-Before-Insert Duplicate Emails on Queue Retry
**What goes wrong:** Queue consumer writes to Resend, then fails writing to `email_sends`. Queue retries the message. Email sent twice.
**Why it happens:** I/O failure between the Resend call and DB write.
**How to avoid:** Always INSERT into `email_sends` first. If insert succeeds (no unique conflict) → send email. If conflict → skip. The DB write is the gate.
**Warning signs:** Test by simulating a Resend 5xx after insert — verify DB row exists but no retry email is sent.

### Pitfall 2: Soft-Unsubscribed Subscribers Included in Digest
**What goes wrong:** After D-20 soft-unsubscribe sets `confirmed_at = NULL`, the subscriber SELECT accidentally includes them if the filter is missing or wrong.
**Why it happens:** Using `.eq("confirmed_at", null)` (wrong) or omitting the filter entirely. The correct filter `.not("confirmed_at", "is", null)` excludes NULL rows.
**How to avoid:** Use `.not("confirmed_at", "is", null)` in the subscriber SELECT. Verify with a test: soft-unsubscribe a subscriber, run digest query, confirm they are excluded.

### Pitfall 3: Missing `digest@windturbinejobs.com` in Resend Sending Domain
**What goes wrong:** Resend rejects the `from` address — 400/403 on every send.
**Why it happens:** D-09 specifies `digest@windturbinejobs.com` as sender. Resend requires the sending domain to be verified AND the specific address (or wildcard) to be authorized.
**How to avoid:** Add `digest@windturbinejobs.com` to the Resend sending domain before first deploy. This is an ops task (pre-deploy).
**Warning signs:** Resend returns `422 Unprocessable Entity` or `You can only send emails from your own domain`.

### Pitfall 4: Cron Runs on the Same Day as Previous Send
**What goes wrong:** Manual trigger or schedule drift causes two digest runs on the same `CURRENT_DATE`. Second run inserts into `email_sends` — unique constraint on `(subscriber_id, CURRENT_DATE, 'digest')` blocks duplicates correctly.
**Why it happens:** CURRENT_DATE in DB is UTC. Ensure `sent_date` is always computed as UTC date in the Worker, not local time.
**How to avoid:** Compute sent_date as `new Date().toISOString().slice(0, 10)` (UTC date string) in the Worker. Match to `CURRENT_DATE` in Postgres (also UTC).

### Pitfall 5: Resend Batch Exceeds 100 Per Call
**What goes wrong:** Batch payload array > 100 items causes Resend API error.
**Why it happens:** Per D-15, max 10 subscribers per queue message. Queue consumer receives `max_batch_size` messages. If batch_size is 10 messages × 10 IDs = 100 exactly — at the limit.
**How to avoid:** If `max_batch_size` changes, recalculate max email count per consumer call. Keep total per Resend batch call ≤ 100.

---

## Code Examples

### Migration 0006 (DB idempotency columns)
```sql
-- Source: [ASSUMED] based on D-16 + existing migration pattern
-- File: packages/schema/src/migrations/0006_email_sends_idempotency.sql

ALTER TABLE wind_turbine.email_sends
  ADD COLUMN sent_date DATE    NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN type      TEXT    NOT NULL DEFAULT 'digest';

ALTER TABLE wind_turbine.email_sends
  ADD CONSTRAINT email_sends_subscriber_date_type_key
    UNIQUE (subscriber_id, sent_date, type);
```

### wrangler.toml for workers/digest
```toml
# Source: [VERIFIED: workers/ingest/wrangler.toml] — adapted for digest
name = "owljobs-digest"
main = "src/index.ts"
compatibility_date = "2025-04-08"
compatibility_flags = ["nodejs_compat"]

[triggers]
crons = ["0 6 * * 1"]

[[queues.producers]]
queue = "owljobs-digest"
binding = "DIGEST_QUEUE"

[[queues.consumers]]
queue = "owljobs-digest"
max_batch_size = 1      # One message per consumer call; each message carries N subscriber IDs
max_batch_timeout = 0
max_retries = 2

# Secrets — set via wrangler secret put:
#   wrangler secret put SUPABASE_URL
#   wrangler secret put SUPABASE_SERVICE_KEY
#   wrangler secret put RESEND_API_KEY
#
# For local dev, create workers/digest/.dev.vars:
#   SUPABASE_URL=...
#   SUPABASE_SERVICE_KEY=...
#   RESEND_API_KEY=...
```

### Env interface for workers/digest
```typescript
// Source: [VERIFIED: workers/ingest/src/index.ts] — adapted
export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  RESEND_API_KEY: string;
  DIGEST_QUEUE: Queue<DigestMessage>;
}

interface DigestMessage {
  nicheId: string;
  subscriberIds: string[];
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `List-Unsubscribe` URL-only | Both URL + `List-Unsubscribe-Post: List-Unsubscribe=One-Click` | Gmail/Yahoo Feb 2024 requirement | Required for bulk senders; digest qualifies |
| Loop-and-send in cron handler | Cron → Queue → consumer | CF Workers 30s CPU cap | Queue consumer gets 15-min wall clock, unlimited I/O waits |

**Deprecated/outdated:**
- Resend Node.js SDK: Not available in Workers runtime; use raw `fetch` to `https://api.resend.com` (already the project pattern in `apps/web/src/lib/resend.ts`).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `CURRENT_DATE` in Postgres is UTC | Pitfall 4, Migration pattern | If DB timezone is non-UTC, `sent_date` computed in Worker (UTC) won't match DB `CURRENT_DATE`, causing incorrect duplicate detection |
| A2 | Resend passes through custom `headers` verbatim without stripping `List-Unsubscribe-Post` | Standard Stack, Code Examples | If Resend strips this header, CAND-02 fails — verify with a test send before shipping |
| A3 | `supabase.schema(niche.supabaseSchema)` works for the `email_sends` table defined in `wind_turbine` schema | Architecture Patterns | If schema-scoping doesn't apply to `email_sends`, need to use explicit schema prefix in SQL |

---

## Open Questions

1. **Should GET `/api/unsubscribe` also soft-delete (Conflict 4)?**
   - What we know: GET currently hard-deletes, D-20 POST soft-deletes. This creates inconsistency in FK integrity and re-subscribe UX.
   - What's unclear: Was the hard-delete on GET intentional for Phase 3, or an oversight?
   - Recommendation: Migrate GET to soft-delete too — cleaner FK semantics, better re-subscribe UX, no real downside.

2. **Should `email_sends` migration apply to per-niche schemas generically?**
   - What we know: Migration 0006 modifies `wind_turbine.email_sends`. Future niches will need the same columns.
   - What's unclear: Is there a niche-template SQL or does each niche get its own migration run?
   - Recommendation: Add the columns to the niche template (or note in RUNBOOK that new niches must run this migration).

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Resend sending domain (`digest@windturbinejobs.com`) | CAND-01, CAND-02 | UNKNOWN — ops task | — | Block deploy until configured |
| `owljobs-digest` Cloudflare Queue | CAND-01 | Not created yet | — | Must run `wrangler queues create owljobs-digest` before first deploy |
| Supabase migration 0006 applied | CAND-03 | Not applied | — | Must run `supabase db push` after migration file created |

**Missing dependencies with no fallback:**
- Resend `digest@windturbinejobs.com` sender address must be authorized in Resend dashboard before any digest send.
- `owljobs-digest` queue must be created (`wrangler queues create owljobs-digest`) before `wrangler deploy` will succeed.
- Migration 0006 must be applied to production Supabase before digest worker runs.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (per existing project — `workers/ingest` uses vitest scaffold) |
| Config file | `workers/digest/vitest.config.ts` — Wave 0 gap |
| Quick run command | `pnpm --filter @owljobs/digest test` |
| Full suite command | `pnpm --filter @owljobs/digest test --run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CAND-01 | Cron handler enqueues one message per 10 subscribers | unit | `pnpm --filter @owljobs/digest test -- digest.test.ts` | ❌ Wave 0 |
| CAND-01 | Consumer sends Resend batch call for each message | unit | `pnpm --filter @owljobs/digest test -- digest.test.ts` | ❌ Wave 0 |
| CAND-02 | Resend payload includes `List-Unsubscribe` + `List-Unsubscribe-Post` headers | unit | `pnpm --filter @owljobs/digest test -- digest.test.ts` | ❌ Wave 0 |
| CAND-03 | Second run on same day skips already-sent subscriber (unique constraint violation caught) | unit | `pnpm --filter @owljobs/digest test -- idempotency.test.ts` | ❌ Wave 0 |
| CAND-04 | Newsletter.astro contains social proof text | snapshot | `pnpm --filter @owljobs/web test` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @owljobs/digest test`
- **Per wave merge:** `pnpm --filter @owljobs/digest test --run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `workers/digest/vitest.config.ts` — framework config
- [ ] `workers/digest/src/digest.test.ts` — covers CAND-01, CAND-02
- [ ] `workers/digest/src/idempotency.test.ts` — covers CAND-03 (mock Supabase unique violation)

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Digest worker uses service_role key (internal Worker, no user auth) |
| V3 Session Management | no | Email-only flow, no sessions |
| V4 Access Control | yes | Unsubscribe endpoint must only allow the token-holder to unsubscribe (token is opaque UUID, unguessable) |
| V5 Input Validation | yes | Unsubscribe token from URL query string must be validated as non-empty before DB lookup |
| V6 Cryptography | no | `crypto.randomUUID()` for tokens (already the project pattern) |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Subscriber enumeration via unsubscribe endpoint | Information Disclosure | Return same 200 response whether token found or not (existing unsubscribe.ts does this) |
| Queue message tampering (nicheId injection) | Tampering | Validate `nicheId` against `getAllNiches()` registry before processing (existing ingest pattern) |
| Digest worker secret leakage | Information Disclosure | No debug HTTP endpoints needed in digest worker (unlike ingest's `/ingest-now`) — omit fetch handler |

---

## Project Constraints (from CLAUDE.md)

All directives that affect Phase 3 implementation:

1. **Multi-niche always:** `getAllNiches()` + `niche.supabaseSchema` — no `wind_turbine` hardcoding in `workers/digest/`.
2. **Edge only:** No Node.js servers, no Redis, no external auth. Supabase + Resend via `fetch` only.
3. **Email digest pattern:** Cron → Queue (`max_batch_size: 2` per CLAUDE.md, conflicting with D-15's 10 — see Conflicts section) → Resend.
4. **HTML sanitization:** Not applicable here (digest template is developer-authored, not user-editable content).
5. **`@supabase/ssr` ^0.10.0:** Only required in `apps/web/` (SSR auth). `workers/digest/` uses `@supabase/supabase-js` directly (service_role, no SSR).
6. **Stripe `constructEventAsync`:** Not applicable (no Stripe in this phase).

---

## Sources

### Primary (HIGH confidence)
- `workers/ingest/src/index.ts` — cron + queue producer + consumer pattern (VERIFIED: codebase read)
- `workers/ingest/wrangler.toml` — wrangler config pattern (VERIFIED: codebase read)
- `workers/discover/` — standalone worker directory structure (VERIFIED: codebase read)
- `apps/web/src/lib/resend.ts` — Resend raw fetch pattern (VERIFIED: codebase read)
- `apps/web/src/pages/api/unsubscribe.ts` — existing POST handler (VERIFIED: codebase read)
- Context7 `/llmstxt/resend_llms-full_txt` — Resend batch API, custom headers, List-Unsubscribe pattern
- [RFC 8058 §3.1](https://www.rfc-editor.org/rfc/rfc8058) — one-click POST body spec (CITED)

### Secondary (MEDIUM confidence)
- WebSearch: Cloudflare Queue consumer 15-min wall clock limit, 30s CPU default — consistent with CF docs URL found
- WebSearch: Resend `List-Unsubscribe-Post` requirement confirmed by Resend blog post (Feb 2024 Gmail/Yahoo requirement)

### Tertiary (LOW confidence)
- None — all critical claims verified from codebase or official sources.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use in the monorepo
- Architecture: HIGH — cron+queue pattern copied from working `workers/ingest`
- Pitfalls: HIGH — idempotency pattern and RFC 8058 mechanics verified from spec and existing code
- Conflicts: HIGH — verified from direct codebase read + RFC text

**Research date:** 2026-05-11
**Valid until:** 2026-06-10 (30 days — Resend API and CF Workers limits are stable)
