# Phase 3: Candidate Activation - Pattern Map

**Mapped:** 2026-05-11
**Files analyzed:** 10 (6 explicit + 4 Wave-0 scaffold files)
**Analogs found:** 9 / 10

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `workers/digest/src/index.ts` | worker (cron+queue) | event-driven | `workers/ingest/src/index.ts` | exact |
| `workers/digest/wrangler.toml` | config | — | `workers/ingest/wrangler.toml` | exact |
| `workers/digest/package.json` | config | — | `workers/discover/package.json` | role-match |
| `workers/digest/tsconfig.json` | config | — | `workers/discover/tsconfig.json` | exact |
| `workers/digest/vitest.config.ts` | config/test | — | none in repo | no analog |
| `workers/digest/src/digest.test.ts` | test | — | none in repo | no analog |
| `workers/digest/src/idempotency.test.ts` | test | — | none in repo | no analog |
| `packages/schema/src/migrations/0006_email_sends_idempotency.sql` | migration | — | `packages/schema/src/migrations/0004_stale_jobs_consent.sql` | role-match |
| `apps/web/src/pages/api/unsubscribe.ts` | API route (modify) | request-response | itself (existing file) | exact — modify only |
| `apps/web/src/components/Newsletter.astro` | component (modify) | — | itself (existing file) | exact — static copy change |

---

## Pattern Assignments

### `workers/digest/src/index.ts` (worker, event-driven)

**Analog:** `workers/ingest/src/index.ts`

**Imports pattern** (lines 1-11):
```typescript
import { createClient } from "@supabase/supabase-js";
import { getAllNiches, registerNiche } from "@owljobs/niches";
import windTurbine from "../../../niches/wind-turbine.js";
// + any local helper imports (e.g., renderDigestHtml, renderDigestText)
registerNiche(windTurbine);
```

**Env interface pattern** (lines 17-29 adapted):
```typescript
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

**Supabase client factory pattern** (lines 31-35):
```typescript
function makeSupabase(env: Env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
}
```

**Cron → Queue producer pattern** (lines 38-72):
```typescript
const handler: ExportedHandler<Env, DigestMessage> = {
  async scheduled(_event, env, ctx) {
    const supabase = makeSupabase(env);
    const niches = getAllNiches();

    ctx.waitUntil(
      Promise.allSettled(
        niches.map(async (niche) => {
          const db = supabase.schema(niche.supabaseSchema);
          // Paginate confirmed subscribers in slices of 10
          let offset = 0;
          const batchSize = 10;
          while (true) {
            const { data } = await db
              .from("subscribers")
              .select("id")
              .not("confirmed_at", "is", null)   // CRITICAL: exclude soft-unsubscribed
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

**Queue consumer pattern** (lines 74-117):
```typescript
  async queue(batch, env) {
    const supabase = makeSupabase(env);

    await Promise.allSettled(
      batch.messages.map(async (msg) => {
        const { nicheId, subscriberIds } = msg.body;
        const niche = getAllNiches().find((n) => n.id === nicheId);
        if (!niche) {
          console.warn(`[digest] unknown nicheId: ${nicheId}`);
          msg.ack();
          return;
        }
        const db = supabase.schema(niche.supabaseSchema);
        try {
          // ... sendDigest logic (see Resend batch pattern below)
          msg.ack();
        } catch (err) {
          console.error(`[${nicheId}] digest consumer failed:`, err);
          msg.retry();
        }
      })
    );
  },
};

export default handler;
```

**Resend batch API pattern** (source: `apps/web/src/lib/resend.ts` lines 21-40 — copy auth/error shape; digest uses `/emails/batch` endpoint, NOT `/emails`):
```typescript
// NOTE: workers/digest CANNOT import from apps/web/src/lib/resend.ts (cross-package).
// Copy this raw fetch pattern into workers/digest/src/index.ts directly.

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
if (!res.ok) {
  const text = await res.text();
  throw new Error(`Resend batch error ${res.status}: ${text}`);
}
```

**Idempotency insert-before-send pattern** (from RESEARCH.md Pattern 2 — no existing codebase analog):
```typescript
// MUST insert BEFORE calling Resend. If retry occurs after insert but before send,
// the unique constraint blocks the re-insert → email is skipped, not duplicated.
const todayDate = new Date().toISOString().slice(0, 10); // UTC YYYY-MM-DD

const { error: insertError } = await db
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

**Error handling pattern** (lines 74-117 of ingest, adapted for D-17):
```typescript
// D-17: log + skip failed subscriber; only throw for unrecoverable errors
try {
  // per-subscriber logic
} catch (err) {
  console.error(`[${nicheId}] subscriber ${sub.id} failed:`, err);
  // continue — do not re-throw; next subscriber proceeds
}
// After all subscribers: if Resend returns 5xx on all calls, throw to retry the whole message
```

**No `fetch` handler:** The digest worker does NOT export a fetch handler (unlike ingest's debug endpoints). Security note from RESEARCH: omit fetch handler entirely — no debug HTTP endpoints needed.

---

### `workers/digest/wrangler.toml` (config)

**Analog:** `workers/ingest/wrangler.toml`

**Full pattern** (lines 1-35 of ingest, adapted):
```toml
name = "owljobs-digest"
main = "src/index.ts"
compatibility_date = "2025-04-08"
compatibility_flags = ["nodejs_compat"]

[triggers]
crons = ["0 6 * * 1"]    # Monday 06:00 UTC (D-04)

# Queue — create once with:
#   wrangler queues create owljobs-digest
[[queues.producers]]
queue = "owljobs-digest"
binding = "DIGEST_QUEUE"

[[queues.consumers]]
queue = "owljobs-digest"
max_batch_size = 1          # One message per consumer; each message carries 10 subscriber IDs
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

**max_batch_size note:** CLAUDE.md cites `max_batch_size: 2` as the project default (from classify/enrich queues). RESEARCH recommends `max_batch_size: 1` for the digest queue — each message body already contains 10 subscriber IDs, so one consumer invocation processes one batch of 10 = one Resend batch call. This is simpler and satisfies the CLAUDE.md spirit (no loop-and-send in cron). Planner should document this reasoning in the plan.

---

### `workers/digest/package.json` (config)

**Analog:** `workers/discover/package.json` (lines 1-10)

```json
{
  "name": "@owljobs/digest",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0",
    "@owljobs/niches": "workspace:*"
  }
}
```

**Key difference from discover:** `@owljobs/niches: "workspace:*"` is required (multi-niche iteration). `workers/discover/package.json` does not have it — add explicitly.

---

### `workers/digest/tsconfig.json` (config)

**Analog:** `workers/discover/tsconfig.json` (lines 1-10) — exact copy:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "types": ["@cloudflare/workers-types"],
    "noEmit": true
  },
  "include": [
    "src"
  ]
}
```

---

### `workers/digest/vitest.config.ts` (config/test)

**No analog** — no vitest configs exist in any worker directory. Planner should use RESEARCH.md §Validation Architecture + standard vitest Cloudflare Workers config. Minimal pattern:
```typescript
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "node",  // or cloudflare-workers if using @cloudflare/vitest-pool-workers
  },
});
```

---

### `workers/digest/src/digest.test.ts` + `idempotency.test.ts` (test)

**No analog** — no `*.test.ts` files exist under any worker directory (`workers/ingest/src/` has no test files). Planner: create minimal unit tests per RESEARCH.md §Wave 0 Gaps. Test framework: vitest. Mock Supabase client and Resend fetch. Verify:
- `digest.test.ts`: cron enqueues one message per 10 subscribers; consumer payload includes `List-Unsubscribe` + `List-Unsubscribe-Post` headers.
- `idempotency.test.ts`: second run with simulated `23505` unique constraint error causes skip (no Resend call for that subscriber).

---

### `packages/schema/src/migrations/0006_email_sends_idempotency.sql` (migration)

**Analog:** `packages/schema/src/migrations/0004_stale_jobs_consent.sql`

**Header pattern** (lines 1-13 of 0004):
```sql
-- Adds:
--   wind_turbine.email_sends.sent_date  DATE NOT NULL DEFAULT CURRENT_DATE
--   wind_turbine.email_sends.type       TEXT NOT NULL DEFAULT 'digest'
-- + UNIQUE constraint (subscriber_id, sent_date, type)
--
-- Replace every occurrence of «wind_turbine» with the niche schema name before running
-- (or use pnpm niche:provision <id> which substitutes for you).
--
-- Apply via Supabase SQL editor AFTER 0005_*.sql.
```

**ALTER TABLE pattern** (lines 16-19 of 0004):
```sql
ALTER TABLE wind_turbine.email_sends
  ADD COLUMN sent_date DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN type      TEXT NOT NULL DEFAULT 'digest';

ALTER TABLE wind_turbine.email_sends
  ADD CONSTRAINT email_sends_subscriber_date_type_key
    UNIQUE (subscriber_id, sent_date, type);
```

**Open question for planner (RESEARCH Conflict / Open Question 2):** Migration 0006 modifies `wind_turbine.email_sends`. Future niches need the same columns. Decision: add a comment to the migration noting that new niche provisioning must include this migration, or update the niche provisioning template.

---

### `apps/web/src/pages/api/unsubscribe.ts` (modify — existing file)

**Source:** `apps/web/src/pages/api/unsubscribe.ts` (the file itself is the reference)

**Existing GET handler** (lines 5-44) — hard-deletes with `.delete()`:
```typescript
export const GET: APIRoute = async ({ locals, url }) => {
  const { niche } = locals;
  const env = getEnv(locals);
  const token = url.searchParams.get("token");
  if (!token) return new Response("Missing unsubscribe token.", { status: 400 });
  const db = supabaseAdmin(env);
  const { data, error } = await db
    .schema(niche.supabaseSchema)
    .from("subscribers")
    .delete()
    .eq("unsubscribe_token", token)
    .select("email")
    .single();
  // ...
};
```

**Existing POST handler** (lines 48-64) — currently hard-deletes with `.delete()`:
```typescript
export const POST: APIRoute = async ({ locals, url }) => {
  const { niche } = locals;
  const env = getEnv(locals);
  const token = url.searchParams.get("token");   // token in URL — RFC 8058 compliant
  if (!token) return new Response("Missing token.", { status: 400 });
  const db = supabaseAdmin(env);
  await db
    .schema(niche.supabaseSchema)
    .from("subscribers")
    .delete()                           // <-- CHANGE THIS to .update({ confirmed_at: null })
    .eq("unsubscribe_token", token);
  return new Response("OK", { status: 200 });
};
```

**Required change (D-20):** Replace `.delete()` in the POST handler with `.update({ confirmed_at: null })`. The token stays in `url.searchParams` — already correct per RFC 8058.

**CONTEXT D-19 conflict resolved (RESEARCH Conflict 2):** Do NOT create a new `/api/unsubscribe-oneclick` file. The POST handler already exists at `/api/unsubscribe`. Modify in place.

**Open question for planner (RESEARCH Conflict 4):** Should GET also be changed to soft-delete (`update({ confirmed_at: null })`) for FK integrity and re-subscribe UX? RESEARCH recommends yes. Planner must decide and document the choice.

**Soft-unsubscribe security note (RESEARCH Pitfall 2):** After this change, the subscriber SELECT in the digest worker MUST use `.not("confirmed_at", "is", null)` — `.eq("confirmed_at", null)` is wrong in Supabase PostgREST and returns no results or all rows depending on version.

---

### `apps/web/src/components/Newsletter.astro` (modify — existing file)

**Source:** `apps/web/src/components/Newsletter.astro` (the file itself is the reference)

**Target location for social proof text** (line 96 — existing "No spam" line):
```astro
<p class="mt-4 text-xs text-muted-foreground">
  No spam, unsubscribe anytime.
</p>
```

**Required change (D-12):** Add a second line (or replace with combined text) displaying the static social proof copy. Planner decides exact markup; example:
```astro
<p class="mt-4 text-xs text-muted-foreground">
  420+ jobs from 20+ employers. No spam, unsubscribe anytime.
</p>
```

Update manually after major ingests — no dynamic DB query (D-12).

---

## Shared Patterns

### Supabase client initialization (Workers)
**Source:** `workers/ingest/src/index.ts` lines 31-35
**Apply to:** `workers/digest/src/index.ts`
```typescript
function makeSupabase(env: Env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
}
```
Note: Workers use `@supabase/supabase-js` directly with service_role key. `@supabase/ssr` is NOT used in workers (web-only per CLAUDE.md).

### Schema-scoped DB access (multi-niche)
**Source:** `workers/ingest/src/index.ts` lines 45, 87
**Apply to:** `workers/digest/src/index.ts`
```typescript
const db = supabase.schema(niche.supabaseSchema);
// Then: db.from("subscribers"), db.from("jobs"), db.from("email_sends")
// NEVER: supabase.schema("wind_turbine")
```

### Resend raw fetch + error handling (no SDK)
**Source:** `apps/web/src/lib/resend.ts` lines 21-40
**Apply to:** `workers/digest/src/index.ts` (copy pattern, do not import — cross-package)
```typescript
const res = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${env.RESEND_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ ... }),
});
if (!res.ok) {
  const text = await res.text();
  throw new Error(`Resend error ${res.status}: ${text}`);
}
```
Digest uses `/emails/batch` instead of `/emails`. Batch payload is an array of email objects.

### List-Unsubscribe headers (established pattern)
**Source:** `apps/web/src/lib/resend.ts` lines 67-70
**Apply to:** Each email object in digest Resend batch payload
```typescript
headers: {
  "List-Unsubscribe": `<${opts.unsubscribeUrl}>`,
  "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
},
```
In digest: `unsubscribeUrl` = `https://${niche.domain}/api/unsubscribe?token=${sub.unsubscribeToken}` — token in URL (RFC 8058 requires identity in URL, not POST body).

### niche.id validation in queue consumer
**Source:** `workers/ingest/src/index.ts` lines 81-85
**Apply to:** `workers/digest/src/index.ts`
```typescript
const niche = getAllNiches().find((n) => n.id === nicheId);
if (!niche) {
  console.warn(`[queue] unknown nicheId: ${nicheId}`);
  msg.ack();
  return;
}
```

### ctx.waitUntil for async cron work
**Source:** `workers/ingest/src/index.ts` lines 42-71
**Apply to:** `workers/digest/src/index.ts` scheduled handler
```typescript
ctx.waitUntil(
  Promise.allSettled(niches.map(async (niche) => { ... }))
);
```
Required because the cron handler has a 30s CPU cap — `waitUntil` lets the async work continue after the handler returns.

### Astro API route auth pattern
**Source:** `apps/web/src/pages/api/unsubscribe.ts` lines 1-3
**Apply to:** Any new Astro API routes (not digest worker)
```typescript
import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../lib/supabase.js";
import { getEnv } from "../../lib/env.js";
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `workers/digest/vitest.config.ts` | config | — | No vitest configs exist in any worker directory |
| `workers/digest/src/digest.test.ts` | test | — | No `*.test.ts` files exist in any worker; vitest test scaffold is net-new |
| `workers/digest/src/idempotency.test.ts` | test | — | Same as above |

---

## Planner Decision Points (unresolved from RESEARCH.md)

These must be decided and documented in the PLAN before tasks are written:

1. **max_batch_size value** (RESEARCH Conflict 1): `max_batch_size: 1` (RESEARCH recommendation, fits CLAUDE.md spirit) vs `max_batch_size: 10` (D-15 original intent). Recommendation: use `max_batch_size: 1`.
2. **GET unsubscribe: hard-delete vs soft-delete** (RESEARCH Conflict 4 / Open Question 1): Change GET to also soft-delete (`confirmed_at = NULL`) for FK integrity and re-subscribe UX. Recommendation: yes, migrate GET to soft-delete too.
3. **Migration 0006 multi-niche note** (RESEARCH Open Question 2): Add comment or RUNBOOK entry that new niche provisioning requires running 0006. No blocker for Phase 3.

---

## Metadata

**Analog search scope:** `workers/ingest/`, `workers/discover/`, `apps/web/src/pages/api/`, `apps/web/src/components/`, `apps/web/src/lib/`, `packages/schema/src/migrations/`
**Files scanned:** 10 source files read
**Pattern extraction date:** 2026-05-11
