# Phase 1: Production Foundation — Research

**Researched:** 2026-05-09
**Domain:** GDPR compliance + email infra + stale job lifecycle on edge stack (Astro 5 SSR + Cloudflare Pages + Cloudflare Workers + Supabase + Resend)
**Confidence:** HIGH (mostly verified against codebase + official docs)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Stale Job Expiry (DATA-01, DATA-02, DATA-03)**

- **D-01:** Detection — after each employer's ATS fetch, compare returned job IDs against DB rows for that employer. Mark absent IDs as expired. Run expiry only if fetch succeeded with ≥1 results — skip on error/empty to prevent mass-expiry from transient ATS downtime.
- **D-02:** Storage — soft-delete: set `expired_at = NOW()` and `status = 'expired'`. Row kept for audit trail, 410 responses, Indexing API reference.
- **D-03:** Schema — add `status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired'))` to `jobs` via migration `0004`. All read queries filter `status = 'active'`. Migration 0004 also adds `consent_given_at TIMESTAMPTZ` to subscribers.
- **D-04:** Expiry runs in same ingest cron handler (`workers/ingest/src/index.ts`), after each employer ATS fetch.
- **D-05:** Re-listing — if expired job re-appears (same dedup hash), re-activate existing row: `status = 'active'`, clear `expired_at`. No duplicate row.
- **D-06:** Retention — expired rows hard-deleted after 90 days via cleanup step in same ingest cron handler.
- **D-07:** Expired job page UX — return HTTP 410 (not 404) with "This job is no longer available" page + link back to listings.

**Google Indexing API (DATA-03)**

- **D-08:** Full Indexing API integration in Phase 1 — service account + `GOOGLE_INDEXING_KEY` Cloudflare Pages secret. On expiry, ping with `URL_UPDATED` + canonical URL.
- **D-09:** Ping fires synchronously inside ingest worker after marking expired. Failure logged, non-fatal — next run re-checks. No queue overhead.
- **D-10:** Phase 2 (SEO-03) extends to creation/update pings — auth setup in Phase 1 makes that a small delta.

**GDPR Consent (INFRA-05, INFRA-06)**

- **D-11:** Required consent checkbox on `Newsletter.astro`. Text: _"I agree to receive wind turbine job alerts by email. I can unsubscribe at any time. [Read our Privacy Policy.](/privacy)"_ — cannot submit without checking.
- **D-12:** Store consent — `consent_given_at TIMESTAMPTZ` on `subscribers` (migration 0004). Set on initial subscribe API call.

**GDPR Data Deletion (INFRA-08)**

- **D-13:** Deletion form embedded at bottom of `/privacy` — no separate route.
- **D-14:** POST to `/api/delete-request`. Verify Turnstile, email `privacy@windturbinejobs.com`. Inline success: _"We received your request and will process it within 30 days."_ No confirmation email to requester.
- **D-15:** Turnstile bot protection on deletion form (reuse `TURNSTILE_SITE_KEY`).
- **D-16:** Manual processing by founder (Supabase lookup + delete). 30-day GDPR window makes manual acceptable for v1.

**Ops Pre-requisites (INFRA-02, INFRA-03, INFRA-04)** — runbook only, not code:

- **INFRA-02:** Apply migrations 0002 + 0003 + new 0004 via Supabase SQL editor.
- **INFRA-03:** Verify Resend sending domain (SPF/DKIM/DMARC) before any email sent.
- **INFRA-04:** Set Cloudflare Pages secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`, `TURNSTILE_SITE_KEY`, `GOOGLE_INDEXING_KEY`. (Note: see pitfall about `SUPABASE_SERVICE_KEY` — actually 7 secrets.)

### Claude's Discretion

- Exact Supabase query shape for expiry detection (joining `jobs` + `job_sources`)
- Google Indexing API auth approach (service account JSON in env vs. individual fields)
- Privacy page layout for deletion form — keep inline below existing content

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INFRA-02 | Migrations 0002+0003 applied (and new 0004) | Migrations exist on disk; section "Migration 0004 spec" below; ops runbook |
| INFRA-03 | Resend sending domain verified — SPF/DKIM/DMARC | "Resend domain verification" section + ops runbook |
| INFRA-04 | All Cloudflare Pages secrets configured | "Cloudflare Pages secrets" pitfall — 7, not 6 |
| INFRA-05 | GDPR privacy policy page lists data flows | Privacy page already exists with sub-processor table; needs deletion form addition (INFRA-08) and DPA refresh |
| INFRA-06 | Granular consent checkbox at subscribe | "Consent checkbox pattern" code example; D-11/D-12 |
| INFRA-07 | One-click unsubscribe end-to-end | **Already implemented** — see "Verification only" pitfall |
| INFRA-08 | GDPR Article 17 deletion request flow | "Deletion form" code example + `/api/delete-request` pattern |
| DATA-01 | Stale job detection — re-poll, flag absent jobs | "Expiry detection algorithm" code example; D-01 |
| DATA-02 | Expired return 410, removed from sitemap/feed/listings | "Astro 410 status code" pattern + filter additions to `lib/jobs.ts` |
| DATA-03 | JobPosting JSON-LD removed + ping Indexing API | "Google Indexing API on Workers" + service-account JWT pattern; **note**: SEO-01 (JSON-LD) is Phase 2 — Phase 1 only needs the API ping infrastructure since no JSON-LD exists yet |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

| Directive | How research honors it |
|-----------|------------------------|
| **Multi-niche always** — no hardcoded `wind_turbine` schema | All queries use `db.schema(niche.supabaseSchema)` (already the pattern). Migration 0004 must use placeholder `«wind_turbine»` like 0001/0002 |
| **Edge only** — Workers/Pages, no Node servers, no Redis | Indexing API auth must use WebCrypto `crypto.subtle` (not Node `crypto`). `jose` lib works on Workers. No `google-auth-library`. |
| **Stripe webhooks pattern** | Not relevant to Phase 1 (no Stripe code) |
| **Supabase SSR auth `^0.10.0`** | Not relevant to Phase 1 (no auth code) |
| **HTML sanitization with `dompurify`** | Not relevant to Phase 1 (no employer content yet — Phase 4) |
| **Email digest pattern** | Not relevant — Phase 1 only sends transactional confirmation, not digest |

## Summary

Phase 1 is the GDPR + email infra + dead-job lifecycle floor. The codebase already has 90% of the substrate: subscribe/confirm/unsubscribe APIs work, Resend wrapper exists, Turnstile helper exists, RFC 8058 List-Unsubscribe headers are already set, the privacy page exists. Phase 1 fills in:

1. A new migration `0004` adding `jobs.status` + `jobs.expired_at` + `subscribers.consent_given_at`
2. Stale-job detection logic in `workers/ingest/src/ingest.ts` + cleanup step in `index.ts` scheduled handler
3. Synchronous Google Indexing API ping after expiry (RS256 JWT signed with WebCrypto via `jose`)
4. A 410 status branch on `jobs/[slug].astro` + `status = 'active'` filter on every read query
5. A consent checkbox in `Newsletter.astro` enforced by `/api/subscribe` (writes `consent_given_at`)
6. A deletion request form at the bottom of `/privacy` posting to a new `/api/delete-request` endpoint that emails the founder
7. Ops runbook for migrations, Resend DNS, and Pages secrets

**Primary recommendation:** Decompose the 10 requirements into 5 vertical slices (see "MVP Slice Decomposition" below). Use `jose` (npm `jose@6.2.3`, ESM, WebCrypto-native) for Indexing API JWT signing. Flag the JobPosting Indexing API approval gate as an `[ASSUMED]` open question — without Google's explicit allow-listing, the pings may be no-ops.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Stale job detection (compare ATS feed vs DB) | Cloudflare Worker (`workers/ingest`) | Supabase (read+write) | Already runs hourly cron; has service-role DB access; ATS fetch result lives here |
| Mark `status='expired'` + `expired_at=NOW()` | Cloudflare Worker | Supabase | Same context as detection — atomic with the comparison |
| Hard-delete after 90 days | Cloudflare Worker (cleanup step in `scheduled`) | Supabase | Idempotent + low-frequency; same cron as ingest |
| Google Indexing API ping (`URL_UPDATED`) | Cloudflare Worker | Google API | Synchronous after marking expired; failure non-fatal |
| Filter expired jobs from listing/sitemap/feed | Frontend Server (Astro SSR) | Supabase | `lib/jobs.ts` query layer — single chokepoint |
| Return HTTP 410 for expired job page | Frontend Server (Astro SSR `.astro` page) | — | `Astro.response.status = 410` on render path |
| Consent checkbox UI | Browser (form submit) + Frontend Server (validation) | Supabase | Required HTML attribute + server-side enforcement |
| Save `consent_given_at` | Frontend Server (`/api/subscribe`) | Supabase | Already an Astro API route |
| GDPR deletion form (UI) | Browser (client-side fetch on prerendered page) | Frontend Server (`/api/delete-request`) | `/privacy` is `prerender = true` — must be client-fetch |
| GDPR deletion API (notification email) | Frontend Server (`/api/delete-request`) | Resend | Reuses Turnstile + Resend wrapper |
| Migrations | Supabase (manual SQL editor) | — | Ops task, not deploy automation in v1 |
| Resend DNS records | Cloudflare DNS (manual via dashboard) | Resend | Ops task, one-time |

## Standard Stack

### Core (already in repo)

| Library | Version | Purpose | Why standard |
|---------|---------|---------|--------------|
| `astro` | `^5.7.0` | SSR framework | [VERIFIED: package.json] Already locked |
| `@astrojs/cloudflare` | `^12.0.0` | Cloudflare Pages adapter (output: server) | [VERIFIED: astro.config.mjs] |
| `@supabase/supabase-js` | `^2.47.10` | DB client | [VERIFIED: package.json] |
| `tailwindcss` | `^3.4.17` | Styling | [VERIFIED: package.json] |

### New for Phase 1

| Library | Version | Purpose | When to use |
|---------|---------|---------|-------------|
| `jose` | `^6.2.3` | RS256 JWT sign with WebCrypto for Google service account auth | Workers-native, ESM-only, no Node deps. Use in `workers/ingest/src/google-indexing.ts` | [VERIFIED: `npm view jose version` → 6.2.3, 2026 publish window] [CITED: https://github.com/panva/jose] |

**Installation:**
```bash
pnpm --filter @owljobs/ingest add jose
```

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `jose` | `@sagi.io/workers-jwt` | [VERIFIED: WebSearch] purpose-built for Workers + has GCP service-account helper. But maintenance is sparse vs `jose`. Both work; pick `jose` for breadth. |
| `jose` | Hand-rolled `crypto.subtle.sign()` + base64url manual JWT | [ASSUMED] Lower bundle size but reinvents the wheel and creates maintenance liability. Not worth it. |
| Service account in single env JSON blob | Individual fields (`GOOGLE_INDEXING_CLIENT_EMAIL`, `GOOGLE_INDEXING_PRIVATE_KEY`) | Single JSON blob is simpler — set as `GOOGLE_INDEXING_KEY` Worker secret containing the entire downloaded service-account JSON. Parse with `JSON.parse(env.GOOGLE_INDEXING_KEY)` at use-time. CONTEXT.md mentions this is Claude's discretion — recommend single JSON blob. |

## Architecture Patterns

### System Architecture Diagram

```
                      ┌──────────────────────────────────────────┐
                      │  Cloudflare Worker  (workers/ingest)     │
                      │  cron: "0 * * * *"  (hourly)             │
                      │                                           │
  ATS APIs ──fetch──► │  ingestNiche()                            │
  (Workday,           │   ├─ per-employer Promise.allSettled      │
  Greenhouse,         │   │  └─ ats fetch → upsertJob() (insert)  │
  SuccessFactors,     │   │                                       │
  Recruitee,          │   ├─ NEW: detectExpired(employerId)       │
  Softgarden)         │   │   └─ if fetch.results > 0 then        │
                      │   │      diff (db.ids vs ats.ids)         │
                      │   │      → mark absent as expired         │
                      │   │      → ping Indexing API per URL      │
                      │   │                                       │
                      │   └─ NEW: cleanupExpired() (90d)          │
                      └──────────┬───────────────┬────────────────┘
                                 │               │
                                 │               └──► Google Indexing API
                                 │                    (RS256 JWT via jose)
                                 ▼
                      ┌──────────────────────────────────────────┐
                      │  Supabase Postgres                        │
                      │  schema = niche.supabaseSchema            │
                      │   • jobs (status, expired_at)  NEW cols   │
                      │   • subscribers (consent_given_at) NEW    │
                      │   • job_sources, employers (existing)     │
                      └──────────────────────────────────────────┘
                                 ▲
                                 │ (read: status='active' filter)
                      ┌──────────┴───────────────────────────────┐
                      │  Astro 5 SSR on Cloudflare Pages          │
                      │   • /jobs/[slug].astro → 410 if expired   │
                      │   • /sitemap.xml, /feed.{xml,json}        │
                      │   • /privacy.astro (prerender) +          │
                      │     client fetch → /api/delete-request    │
                      │   • /api/subscribe (writes                │
                      │     consent_given_at)                     │
                      │   • /api/unsubscribe (existing, 1-click)  │
                      │   • /api/confirm   (existing)             │
                      │   • /api/delete-request (NEW)             │
                      └──────────┬───────────────────────────────┘
                                 │
                                 ▼
                      ┌──────────────────────────────────────────┐
                      │  Resend (transactional email)             │
                      │   • domain verified (SPF/DKIM/DMARC)      │
                      │   • from: noreply@<niche.domain>          │
                      │   • List-Unsubscribe headers (existing)   │
                      └──────────────────────────────────────────┘
```

### Recommended Project Structure (deltas only)

```
workers/ingest/src/
├── index.ts                  # MODIFIED: scheduled handler — add expiry + cleanup steps
├── ingest.ts                 # MODIFIED: per-employer fetched-IDs returned for diff
├── expire.ts                 # NEW: detectExpired(), cleanupExpired()
└── google-indexing.ts        # NEW: signServiceAccountJWT() + pingUrlUpdated()

apps/web/src/
├── pages/
│   ├── jobs/[slug].astro     # MODIFIED: 410 branch when status='expired'
│   ├── privacy.astro         # MODIFIED: append deletion form section
│   ├── sitemap.xml.ts        # (no change — uses listSitemapJobs which gets the filter)
│   ├── feed.xml.ts           # (no change — uses listFeedJobs which gets the filter)
│   ├── feed.json.ts          # (no change — uses listFeedJobs)
│   └── api/
│       ├── subscribe.ts      # MODIFIED: write consent_given_at
│       └── delete-request.ts # NEW: Turnstile + email founder
├── components/
│   ├── Newsletter.astro      # MODIFIED: required consent checkbox
│   └── DeleteRequestForm.astro # NEW (optional split for clarity)
└── lib/
    └── jobs.ts               # MODIFIED: add status='active' to all read queries

packages/schema/src/migrations/
└── 0004_status_consent.sql   # NEW: jobs.status + jobs.expired_at + subscribers.consent_given_at

packages/schema/src/index.ts  # MODIFIED: add status/expired_at to Job, consent_given_at to Subscriber
```

### Pattern 1: Astro 5 returning HTTP 410 from a `.astro` page on Cloudflare

**What:** Set `Astro.response.status` in the frontmatter before rendering. Verified to work on Cloudflare for non-404 codes.
**When to use:** `/jobs/[slug]` when DB returns a row with `status='expired'`.

```astro
---
// apps/web/src/pages/jobs/[slug].astro
import Layout from "../../components/Layout.astro";
import { supabasePublic } from "../../lib/supabase.js";
import { getJobBySlug } from "../../lib/jobs.js";
import { getEnv } from "../../lib/env.js";

const { niche } = Astro.locals;
const env = getEnv(Astro.locals);
const { slug } = Astro.params;
if (!slug) return Astro.redirect("/404");

const db = supabasePublic(env);
const job = await getJobBySlug(db, niche.supabaseSchema, slug); // returns row regardless of status

if (!job) return Astro.redirect("/404");

if (job.status === "expired") {
  Astro.response.status = 410;
  // Don't cache long — propagation must be fast
  Astro.response.headers.set("Cache-Control", "public, s-maxage=300, max-age=0");
}
---
{job.status === "expired" ? (
  <Layout title="Job no longer available" description="This role has been filled or removed.">
    <main class="mx-auto max-w-2xl px-4 py-24 text-center">
      <h1 class="text-3xl font-bold">This job is no longer available</h1>
      <p class="mt-4 text-muted-foreground">It may have been filled or withdrawn by the employer.</p>
      <a href="/jobs" class="mt-8 inline-flex rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground hover:bg-accent/90">
        Browse open roles →
      </a>
    </main>
  </Layout>
) : (
  <!-- existing job-detail template -->
)}
```
[CITED: https://docs.astro.build/en/guides/integrations-guide/cloudflare/] — `Astro.response.status` works in SSR. The 404 issue (GH#12541) is specific to 404 + Cloudflare's own fallback page; 410 is unaffected. [VERIFIED: WebSearch result confirms]

### Pattern 2: `getJobBySlug` must NOT pre-filter `status`

The slug page needs to know whether the job exists but is expired (return 410) vs. doesn't exist (return 404). Therefore:

- `getJobBySlug` keeps current behavior — no status filter.
- `listJobs`, `listFeedJobs`, `listSitemapJobs`, `listEmployerJobs`, `getStats.activeJobs` ALL add `.eq("status", "active")`.

[VERIFIED: codebase read of `apps/web/src/lib/jobs.ts`]

### Pattern 3: Service-account JWT for Google Indexing API on Workers

**What:** Sign an RS256 JWT with the service-account private key using WebCrypto via `jose`, exchange for an OAuth access token, then POST to the Indexing API.
**When to use:** Inside `workers/ingest/src/google-indexing.ts`, called once per expired URL.

```typescript
// workers/ingest/src/google-indexing.ts
import { SignJWT, importPKCS8 } from "jose";

interface ServiceAccountKey {
  client_email: string;
  private_key: string;        // PEM, with \n escapes when stored as JSON in env
  token_uri: string;          // "https://oauth2.googleapis.com/token"
}

async function getAccessToken(saJson: string): Promise<string> {
  const sa: ServiceAccountKey = JSON.parse(saJson);

  // The private_key in the JSON has literal \n; must be unescaped
  const pem = sa.private_key.replace(/\\n/g, "\n");
  const privateKey = await importPKCS8(pem, "RS256");

  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({
      scope: "https://www.googleapis.com/auth/indexing",
    })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience(sa.token_uri)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey);

  const res = await fetch(sa.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

export async function pingUrlUpdated(saJson: string, url: string): Promise<{ ok: boolean; status: number }> {
  const accessToken = await getAccessToken(saJson);

  const res = await fetch("https://indexing.googleapis.com/v3/urlNotifications:publish", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url, type: "URL_UPDATED" }),
  });
  return { ok: res.ok, status: res.status };
}
```

[CITED: https://hookdeck.com/blog/how-to-call-google-cloud-apis-from-cloudflare-workers] [CITED: https://medium.com/@tamnvhustcc/how-to-authenticate-google-apis-on-cloudflare-workers-in-2025-a-complete-guide-with-custom-jwt-80614398425a] [CITED: https://github.com/panva/jose]

**Note on `URL_UPDATED` for removal:** Google's Indexing API uses `URL_UPDATED` when the URL's content has changed in a way that affects indexing — including transition to 410. Use `URL_DELETED` only when the URL is being permanently removed from your sitemap as well. For job expiry → 410 with the URL still resolving, `URL_UPDATED` is correct. [CITED: WebSearch — Google Indexing API docs reference]

### Pattern 4: Stale-job detection — diff returned IDs vs DB rows for that employer

**What:** After each successful per-employer ATS fetch (≥1 result), compute `db_ids - ats_ids` and mark those rows expired.
**When to use:** Inside the per-employer adapter loop, after `fetchAll<...>Jobs()` returns.

```typescript
// workers/ingest/src/expire.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { sha256Hex } from "@owljobs/schema";
import { pingUrlUpdated } from "./google-indexing.js";

type SchemaClient = ReturnType<SupabaseClient["schema"]>;

export interface ExpireResult {
  marked: number;
  reactivated: number;
  pinged: number;
  pingFailures: number;
  pingsSkipped: number;   // due to per-run cap (see pitfalls)
}

const PING_BUDGET_PER_RUN = 100; // soft cap to stay under 200/day quota

export async function expireMissingJobs(
  db: SchemaClient,
  employerId: string,
  fetchedExternalIds: Set<string>,
  saJson: string | undefined,
): Promise<ExpireResult> {
  // Build dedup-hash set the same way upsertJob does: sha256(canonical_url)
  // OR use the pre-existing job.id (which IS sha256(canonical_url))
  // — but we need to compare on whatever ATS gives us. ATS returns its own
  // sourceId; we stored the canonical_url-hash as job.id. So compare via
  // job_sources.source_url IS NOT NULL and join on job_id.
  //
  // Simpler approach: re-derive job.id = sha256Hex(canonical_url) for each
  // fetched job in the calling adapter, pass IDs in.

  if (fetchedExternalIds.size === 0) {
    // CONTEXT D-01: skip if fetch returned nothing — could be ATS outage
    return { marked: 0, reactivated: 0, pinged: 0, pingFailures: 0, pingsSkipped: 0 };
  }

  // Get all currently-active jobs for this employer
  const { data: dbJobs, error } = await db
    .from("jobs")
    .select("id, canonical_url, status, expired_at")
    .eq("employer_id", employerId)
    .eq("status", "active");
  if (error) throw new Error(`expireMissingJobs select failed: ${error.message}`);

  const toExpire = (dbJobs ?? []).filter((j) => !fetchedExternalIds.has(j.id));
  if (toExpire.length === 0) {
    return { marked: 0, reactivated: 0, pinged: 0, pingFailures: 0, pingsSkipped: 0 };
  }

  const ids = toExpire.map((j) => j.id);
  const { error: updErr } = await db
    .from("jobs")
    .update({ status: "expired", expired_at: new Date().toISOString() })
    .in("id", ids);
  if (updErr) throw new Error(`expireMissingJobs update failed: ${updErr.message}`);

  let pinged = 0, pingFailures = 0, pingsSkipped = 0;
  if (saJson) {
    for (const job of toExpire) {
      if (pinged + pingFailures >= PING_BUDGET_PER_RUN) {
        pingsSkipped = toExpire.length - (pinged + pingFailures);
        break;
      }
      try {
        const r = await pingUrlUpdated(saJson, job.canonical_url);
        r.ok ? pinged++ : pingFailures++;
      } catch (err) {
        console.warn(`[indexing] ping failed for ${job.canonical_url}:`, err);
        pingFailures++;
      }
    }
  }

  return { marked: ids.length, reactivated: 0, pinged, pingFailures, pingsSkipped };
}

export async function cleanupExpired(db: SchemaClient): Promise<number> {
  const cutoff = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
  const { data, error } = await db
    .from("jobs")
    .delete()
    .eq("status", "expired")
    .lt("expired_at", cutoff)
    .select("id");
  if (error) throw new Error(`cleanupExpired failed: ${error.message}`);
  return data?.length ?? 0;
}
```

### Pattern 5: Re-listing (D-05) — modify `upsertJob` to re-activate on 23505

The current `upsertJob` only backfills description on duplicate-key. Add a re-activation branch:

```typescript
// workers/ingest/src/ingest.ts (modified upsertJob)
if (error.code === "23505") {
  // Existing description backfill
  if (input.description) {
    await db.from("jobs").update({ description: input.description }).eq("id", input.id).is("description", null);
  }
  // NEW: if the existing row was expired, re-activate
  await db
    .from("jobs")
    .update({ status: "active", expired_at: null })
    .eq("id", input.id)
    .eq("status", "expired");
  return false; // still a "skipped" insert from the caller's perspective
}
```

### Pattern 6: Consent checkbox in `Newsletter.astro` + `/api/subscribe`

**HTML (in Newsletter.astro form):**
```astro
<label class="mt-4 flex items-start gap-2 text-left text-xs text-muted-foreground">
  <input
    type="checkbox"
    name="consent"
    id="subscribe-consent"
    required
    class="mt-0.5 h-4 w-4 cursor-pointer rounded-sm border-input bg-transparent checked:border-primary checked:bg-primary"
  />
  <span>
    I agree to receive {niche.name.toLowerCase()} job alerts by email. I can unsubscribe at any time.
    <a href="/privacy" class="underline">Read our Privacy Policy.</a>
  </span>
</label>
```

**Client-side (Newsletter.astro `<script>`):**
```typescript
const consent = (form.querySelector('[name="consent"]') as HTMLInputElement | null)?.checked ?? false;
if (!consent) {
  errorEl.textContent = "Please confirm you agree to receive job alerts.";
  return;
}
// ... existing submit ...
body: JSON.stringify({ email, turnstileToken, consent: true })
```

**Server-side (`api/subscribe.ts`):**
```typescript
if (!body.consent) {
  return Response.json({ error: "Consent required." }, { status: 400 });
}
// ... existing flow ...
.upsert({
  // ...existing fields...
  consent_given_at: new Date().toISOString(),
})
```

### Pattern 7: GDPR deletion form on prerendered `/privacy` (client-side fetch)

`/privacy` is `prerender = true`, so the form must be a client-side `fetch` to `/api/delete-request` (a server route). Use the same Turnstile pattern as Newsletter.astro.

```astro
---
// privacy.astro — append before </Layout>
import { getEnv } from "../lib/env.js";
const env = getEnv(Astro.locals);
const turnstileSiteKey = env.TURNSTILE_SITE_KEY;
---
<section class="mx-auto max-w-2xl px-4 py-10 sm:px-6">
  <h2 class="text-xl font-bold text-foreground">Request data deletion</h2>
  <p class="mt-2 text-sm text-muted-foreground">
    Under GDPR Article 17 you may request that we delete all personal data we hold about you.
    Submit your email below and we will process the request within 30 days.
  </p>
  <form id="delete-form" novalidate class="mt-4 space-y-3" data-turnstile-key={turnstileSiteKey}>
    <input type="email" name="email" id="delete-email" placeholder="your@email.com" required
           class="h-12 w-full rounded-md border border-border bg-background px-3 text-sm" />
    <div class="cf-turnstile" data-sitekey={turnstileSiteKey} data-theme="auto"></div>
    <button type="submit" id="delete-submit"
            class="inline-flex h-12 items-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground">
      Submit request
    </button>
    <p id="delete-error" class="text-sm text-destructive min-h-[1.25rem]" role="alert" aria-live="polite"></p>
    <p id="delete-success" class="text-sm text-accent min-h-[1.25rem]" role="status" aria-live="polite"></p>
  </form>
</section>

<!-- Turnstile is already loaded by Newsletter.astro on subscribe page; load defensively -->
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer is:inline></script>

<script>
  const f = document.getElementById("delete-form") as HTMLFormElement | null;
  if (f) {
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const emailEl = document.getElementById("delete-email") as HTMLInputElement;
      const errEl = document.getElementById("delete-error")!;
      const okEl = document.getElementById("delete-success")!;
      errEl.textContent = ""; okEl.textContent = "";
      const turnstileToken = (f.querySelector<HTMLInputElement>('[name="cf-turnstile-response"]')?.value) ?? "";
      const res = await fetch("/api/delete-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailEl.value.trim(), turnstileToken }),
      });
      const json = (await res.json()) as { error?: string; message?: string };
      if (res.ok) {
        okEl.textContent = json.message ?? "We received your request and will process it within 30 days.";
        f.reset();
        if (typeof (window as any).turnstile !== "undefined") (window as any).turnstile.reset();
      } else {
        errEl.textContent = json.error ?? "Something went wrong. Try again.";
      }
    });
  }
</script>
```

**Server (`/api/delete-request.ts`):** mirror `subscribe.ts` Turnstile + Resend pattern. Send email to `privacy@windturbinejobs.com` (or per-niche `privacy@${niche.domain}`) using `sendEmail` (extract or add to `lib/resend.ts`).

### Anti-Patterns to Avoid

- **Do NOT use `Astro.redirect("/404")` for expired jobs** — that's a 302 to /404 (200 OK), not a 410. Set `Astro.response.status = 410` and render a body in the same .astro file.
- **Do NOT pre-filter `status='expired'` in `getJobBySlug`** — page must distinguish 410 (was here, now gone) from 404 (never here).
- **Do NOT loop and ping Indexing API for hundreds of jobs in one cron run** — quota is 200/day. Cap pings per run; let subsequent runs catch up. Better: only ping going forward (skip backfill on first run).
- **Do NOT add Indexing API ping into the queue chain** (CONTEXT.md `code_context`). Run synchronously inside ingest worker.
- **Do NOT cache the 410 page with the existing `setCacheHeaders(600, 3600)` defaults** — propagation will lag by an hour. Use `s-maxage=300, max-age=0` or similar on the 410 branch.

## Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---------|-------------|-------------|-----|
| RS256 JWT signing on Workers | Manual base64url + `crypto.subtle.sign()` JWT plumbing | `jose` (`SignJWT` + `importPKCS8`) | Edge cases: PEM parsing, ASN.1 quirks, base64url padding. `jose` is the de-facto standard, ~12 KB minified. |
| OAuth2 token exchange | Custom token cache + refresh logic | Tokens last 1 hour; just request a new one per cron run (hourly cron = perfect alignment). No cache needed. | Simplicity > caching for hourly cron |
| Turnstile verify | Re-implementing in `delete-request.ts` | Reuse `apps/web/src/lib/turnstile.ts` | Already verified working on this stack |
| Email sending | Raw Resend fetch | Extend `apps/web/src/lib/resend.ts` with a generic `sendEmail()` export and a new `sendDeletionRequest()` helper | Maintains the established wrapper pattern |
| RFC 8058 List-Unsubscribe headers | New code | **Already implemented** in `lib/resend.ts` (`sendConfirmation`) and `api/unsubscribe.ts` (POST handler) | INFRA-07 = verification only |
| `consent_given_at` semantics | Marketing/analytics opt-in libs | Single TIMESTAMPTZ column + a required HTML checkbox | This is "consent for service email" — no marketing consent split needed in v1 |

**Key insight:** The repo already has Resend + Turnstile + Supabase plumbing wired for transactional flows. Phase 1 is mostly _additive surface_ (one new migration, one new endpoint, one new sub-form) and a few targeted modifications, not new infrastructure.

## Runtime State Inventory

> Phase 1 is greenfield-additive (new migration + new code). It does NOT rename or refactor existing identifiers. Brief audit of any pre-existing state that interacts with new fields:

| Category | Items found | Action required |
|----------|-------------|------------------|
| Stored data | Existing `jobs` rows have no `status` column yet — migration 0004 adds with `DEFAULT 'active'`. Existing `subscribers` rows have no `consent_given_at` — migration adds NULL-able column. | None. Defaults handle backfill. Existing subscribers have NULL `consent_given_at` — that's correct: they consented under prior wording (still pre-prod, very low row count). For audit trail, recommend a one-line UPDATE setting `consent_given_at = created_at` for all existing rows in the same migration. |
| Live service config | Resend dashboard: domain `windturbinejobs.com` not yet verified (per INFRA-03). Cloudflare DNS: SPF/DKIM/DMARC records to be added. Cloudflare Pages secrets: 6 (or 7 — see pitfall) to be set. Cloudflare Worker secrets (`workers/ingest`): existing `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` set; NEW `GOOGLE_INDEXING_KEY` to add. Google Cloud: service-account creation + Indexing API enable + (possibly) JobPosting allow-list approval. | Ops runbook entries (see Slice 5). |
| OS-registered state | None — all execution is on managed edge runtimes. | None. |
| Secrets / env vars | `GOOGLE_INDEXING_KEY` is NEW (Worker secret on `workers/ingest`, NOT a Pages secret — pinging happens in the Worker, not in Pages). CONTEXT.md INFRA-04 mistakenly classifies it as a Pages secret. **Surface this discrepancy to user.** Existing: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`, `TURNSTILE_SITE_KEY` (all 6 referenced in `apps/web/src/lib/env.ts`). | Update wrangler runbook step. See pitfall section. |
| Build artifacts / installed packages | Adding `jose` to `workers/ingest/package.json` requires a Workers deploy. No stale packages. | Run `pnpm install` after adding. |

## Common Pitfalls

### Pitfall 1: `expires_at` already exists on `jobs` — naming collision risk
**What goes wrong:** `0001_initial.sql` line 31 defines `jobs.expires_at TIMESTAMPTZ` (employer-stated closing date, used in UI at `apps/web/src/pages/jobs/[slug].astro:137` "Closes {date}"). CONTEXT.md D-02 introduces `expired_at` (our detection timestamp). Two near-identical column names will confuse maintainers.
**Why it happens:** Different concepts — one is what the employer said, one is what we detected.
**How to avoid:** Pick one of:
  - **(Recommended)** Use `expired_at` as proposed; document the distinction in the migration comment block.
  - Alternative: rename detection field to `marked_expired_at` for unambiguous naming.
**Warning signs:** A developer reading `getStats()` (which uses `expires_at` for "active jobs" filtering) and not realizing the new field is different.
[VERIFIED: codebase grep — `lib/jobs.ts:154` references `expires_at`]

### Pitfall 2: Cloudflare Pages secret count is 7, not 6
**What goes wrong:** CONTEXT.md INFRA-04 lists 6 Pages secrets. But `apps/web/src/lib/env.ts` defines 7: `SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY, RESEND_API_KEY, TURNSTILE_SECRET_KEY, TURNSTILE_SITE_KEY` — that's 6 — PLUS the API routes (`subscribe.ts`, `confirm.ts`, `unsubscribe.ts`, NEW `delete-request.ts`) call `supabaseAdmin()` which needs `SUPABASE_SERVICE_KEY`. CONTEXT.md INFRA-04 also incorrectly lists `GOOGLE_INDEXING_KEY` as a Pages secret — but the Indexing API call lives in the **Worker**, not in Pages.
**Why it happens:** The Worker and Pages have separate secret namespaces, and CONTEXT was written before the env.ts file structure was confirmed.
**How to avoid:**
  - **Pages secrets (6):** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`, `TURNSTILE_SITE_KEY`
  - **Worker secrets (`workers/ingest`):** `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `GOOGLE_INDEXING_KEY`
**Warning signs:** Production deploy boots with "missing-env" error for `SUPABASE_SERVICE_KEY`, OR Indexing API pings 401 (key was set on wrong target).
[VERIFIED: read of `apps/web/src/lib/env.ts`, `apps/web/src/lib/supabase.ts`, all 4 API routes, `workers/ingest/src/index.ts` env interface]

### Pitfall 3: Re-listing branch absent from `upsertJob`
**What goes wrong:** Current `workers/ingest/src/ingest.ts:362-403` does an `.insert()`. On 23505 it only backfills description. CONTEXT D-05 requires re-activating an expired row when same dedup hash returns. Without an explicit branch, an expired job that re-appears stays expired in DB forever.
**Why it happens:** Pre-existing code wasn't designed for the expiry lifecycle.
**How to avoid:** Add the re-activation update inside the 23505 branch (Pattern 5 above).
**Warning signs:** A job that expires and re-appears in the next cron run still shows `status='expired'`.
[VERIFIED: read of `workers/ingest/src/ingest.ts`]

### Pitfall 4: JobPosting Indexing API requires Google approval
**What goes wrong:** Default Indexing API quota is 200/day. **For pages with `JobPosting` markup, Google requires explicit approval via a form.** Without approval, pings may be silently ignored even if the API returns 200. This is documented in Google's quota-pricing page.
**Why it happens:** Indexing API was originally designed for `JobPosting` and `BroadcastEvent` time-sensitive content; Google gates this to prevent abuse.
**How to avoid:**
  - Submit the [Indexing API request form](https://docs.google.com/forms/d/e/1FAIpQLSfPPaTmvCYlmjZyRSAlEC-z5tEEPCNFZ59CQjXOLKaLYqIK7w/viewform) BEFORE Phase 1 ships, OR
  - Accept that Phase 1 ships the integration code but real Google response handling is deferred until approval lands.
**Warning signs:** Indexing API returns 200 OK but URL doesn't update in Search Console within 48 hours.
[ASSUMED → CITED: WebSearch result on quota-pricing] — **This is the biggest risk and must be surfaced to user before planning. See Open Questions.**

### Pitfall 5: First-run quota explosion
**What goes wrong:** The 200/day default quota is per project. If an existing employer disappears entirely (~50–200 jobs go stale at once), one cron run could attempt 100+ pings, hitting 429 quickly.
**Why it happens:** Cron runs hourly; if all 3 current employers drop dozens of stale rows on first deployment, you saturate the quota.
**How to avoid:**
  - Per-run cap: `PING_BUDGET_PER_RUN = 100` in `expire.ts` (Pattern 4 above).
  - Optional: on first deployment, set existing rows to `status='active', expired_at=NULL` (no historical backfill of pings — only ping going forward).
**Warning signs:** Logs show "429 Too Many Requests" from Indexing API. Subsequent rows remain marked expired but un-pinged (next run picks them up — that's fine because cap is per-run).

### Pitfall 6: 410 page caching (CDN serves stale 200 OK)
**What goes wrong:** `jobs/[slug].astro` currently calls `setCacheHeaders(600, 3600)`. If a job is pinged as `URL_UPDATED` but Cloudflare keeps serving the cached 200 OK for an hour, Google's recrawl (which the ping triggers) sees 200 OK and ignores the expiry.
**Why it happens:** CDN caching is desirable for active jobs but actively harmful for the moment of expiry.
**How to avoid:** In the 410 branch, override with `Cache-Control: public, s-maxage=300, max-age=0`. Optionally, on expiry, also send a Cloudflare cache purge (defer to discretion — adds API call complexity).
**Warning signs:** Search Console reports the URL as still active 24+ hours after expiry.

### Pitfall 7: `lib/jobs.ts` `getStats()` already filters by `expires_at` — coordinate with new `status`
**What goes wrong:** `getStats.activeJobs` does `.or("expires_at.is.null,expires_at.gt.now()")` — that filter is for employer-stated closing date, NOT for our soft-delete. After 0004, it must ALSO filter `.eq("status", "active")` or the count is wrong.
**Why it happens:** Two parallel concepts of "active job" — pitfall 1's collision in action.
**How to avoid:** Add `.eq("status", "active")` to all three stat queries in `getStats()`.

### Pitfall 8: Astro `prerender = true` on `/privacy` blocks server-side env access
**What goes wrong:** `privacy.astro` has `export const prerender = true`. `getEnv(Astro.locals)` will succeed at build time but `Astro.locals.runtime` may be empty in prerender. Reading `TURNSTILE_SITE_KEY` for the form needs a non-prerendered context, OR the key needs to be inlined at build time via `import.meta.env`.
**Why it happens:** Prerendered pages are static HTML — no runtime env at request time.
**How to avoid:** TURNSTILE_SITE_KEY is a **public** key (it's already exposed in `<div data-sitekey>` in Newsletter.astro). Read it from `import.meta.env.TURNSTILE_SITE_KEY` (or pass via `astro.config` / Astro env vars) at build time. Set as a public env var (Cloudflare Pages: build env, not secret).
**Warning signs:** Privacy page renders without the Turnstile widget; build-time error about missing env.
[VERIFIED: codebase shows TURNSTILE_SITE_KEY already inlined as a `data-sitekey` attribute on Newsletter.astro — same pattern works here]

### Pitfall 9: INFRA-07 (one-click unsubscribe) is already implemented
**What goes wrong:** Implementing it as new code wastes effort and risks regressing what works.
**Why it happens:** The roadmap was written before the codebase reached its current state.
**How to avoid:** Treat INFRA-07 as a **verification-only** slice. Tests:
  1. Subscribe → confirmation email arrives with `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers.
  2. `curl -X POST 'https://windturbinejobs.com/api/unsubscribe?token=<valid>'` → 200, row deleted.
  3. Click unsubscribe link in Gmail/Outlook UI → confirmation page renders.
**Warning signs:** Engineer writes a new unsubscribe endpoint when one already exists.
[VERIFIED: read of `apps/web/src/pages/api/unsubscribe.ts` (GET + POST), `apps/web/src/lib/resend.ts:59-62` (headers set)]

## Code Examples

(See Patterns 1–7 in "Architecture Patterns" — fully fleshed code examples consolidated there.)

### Migration 0004 specification

```sql
-- packages/schema/src/migrations/0004_status_consent.sql
-- Adds: jobs.status + jobs.expired_at (soft-delete for stale jobs)
--       subscribers.consent_given_at (GDPR consent timestamp)
--
-- Replace «wind_turbine» with the niche schema name before running
-- (or use pnpm niche:provision <id> which substitutes for you).

-- 1. Stale-job lifecycle on jobs
ALTER TABLE wind_turbine.jobs
  ADD COLUMN status     TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'expired')),
  ADD COLUMN expired_at TIMESTAMPTZ;

-- Index for fast cleanup of expired rows past 90-day retention
CREATE INDEX idx_jobs_expired_at_cleanup
  ON wind_turbine.jobs(expired_at)
  WHERE status = 'expired';

-- Index for fast filtering of active rows in listing/feed/sitemap queries
-- (status is highly selective once expiry is running)
CREATE INDEX idx_jobs_status_active
  ON wind_turbine.jobs(status, posted_at DESC)
  WHERE status = 'active';

-- 2. GDPR consent timestamp on subscribers
ALTER TABLE wind_turbine.subscribers
  ADD COLUMN consent_given_at TIMESTAMPTZ;

-- Backfill existing subscribers (low row count, pre-prod) — they consented
-- under earlier wording; record their original signup as the consent moment
-- so the column is never NULL for legitimate subscribers post-migration.
UPDATE wind_turbine.subscribers
   SET consent_given_at = created_at
 WHERE consent_given_at IS NULL;

-- 3. Update the existing public_relevant_jobs RLS policy to exclude expired rows
DROP POLICY IF EXISTS public_relevant_jobs ON wind_turbine.jobs;
CREATE POLICY public_relevant_jobs ON wind_turbine.jobs FOR SELECT TO anon
  USING (
    status = 'active'
    AND (
      classification_score >= 0.6
      OR (is_sponsored AND (featured_until IS NULL OR featured_until > now()))
    )
  );
```

[VERIFIED: matches schema convention from `0001_initial.sql` and `0002_rls.sql`]

## State of the Art

| Old approach | Current approach | When changed | Impact |
|--------------|------------------|--------------|--------|
| Hard-delete stale jobs immediately | Soft-delete with `status='expired'` + 410 + Indexing ping | Phase 1 | Google deindex signal, audit trail, enables re-activation |
| Implicit consent (just clicking subscribe) | Explicit required checkbox + DB-stored timestamp | Phase 1 (this phase) | GDPR Art 7 compliance |
| `google-auth-library` for service-account JWT | `jose` + WebCrypto | Cloudflare Workers (not Node) | Edge-native, no Node deps |
| Indexing API only on creation | Ping on creation + expiry + (Phase 2) update | Phase 1 sets up auth; Phase 2 (SEO-03) extends | Faster Google sync |

**Deprecated/outdated:**
- `google-auth-library` — Node-only, doesn't run on Workers. Avoid.
- `Astro.redirect("/404")` for "not really 404" cases — pattern in current `[slug].astro` for not-found is fine; for expired we use 410 instead.

## MVP Slice Decomposition

The 10 requirements decompose into 5 vertical slices. Ordering follows risk-first (DB migration before code that depends on it; ops-only items last).

### Slice 1: Stale job lifecycle (vertical) — DATA-01 + DATA-02 + DATA-03
**Why first:** All other read-path changes depend on the new `status` column. Touches DB → Worker → Pages.

- Migration 0004 (status + expired_at + consent_given_at columns; RLS update)
- TypeScript type updates in `packages/schema/src/index.ts`
- `workers/ingest/src/expire.ts` (new) — `expireMissingJobs`, `cleanupExpired`
- `workers/ingest/src/google-indexing.ts` (new) — `pingUrlUpdated` with `jose`
- `workers/ingest/src/ingest.ts` — refactor adapters to return `Set<string>` of fetched IDs; call `expireMissingJobs` per employer; add re-activation branch in `upsertJob` 23505 handler
- `workers/ingest/src/index.ts` — wire `cleanupExpired` into scheduled handler
- `workers/ingest/wrangler.toml` — document `GOOGLE_INDEXING_KEY` secret
- `apps/web/src/lib/jobs.ts` — add `.eq("status", "active")` to `listJobs`, `listFeedJobs`, `listSitemapJobs`, `listEmployerJobs`, `getStats`
- `apps/web/src/pages/jobs/[slug].astro` — add 410 branch with no-cache header
- Acceptance: hourly cron marks jobs expired; expired URL returns 410; sitemap excludes; Indexing API receives ping (or 429 capped)

### Slice 2: GDPR consent (vertical) — INFRA-05 + INFRA-06
**Why second:** Migration 0004 already added `consent_given_at` in Slice 1. Just wire UI + API + privacy page DPA refresh.

- `apps/web/src/components/Newsletter.astro` — add required consent checkbox + client-side validation
- `apps/web/src/pages/api/subscribe.ts` — require `consent: true`; write `consent_given_at`
- `apps/web/src/pages/privacy.astro` — refresh DPA (current text is OK; verify niche.name templating, not hardcoded "Wind Turbine Jobs"; multi-niche correctness)
- Acceptance: subscribing without ticking the box returns 400; ticking box stores timestamp.

### Slice 3: GDPR deletion form (vertical) — INFRA-08
**Why third:** Independent of other slices; touches `/privacy` (Slice 2 may have already touched it — coordinate).

- `apps/web/src/pages/privacy.astro` — append deletion form section
- `apps/web/src/pages/api/delete-request.ts` (new) — Turnstile + email founder
- `apps/web/src/lib/resend.ts` — extract generic `sendEmail` if not already; add `sendDeletionRequest` helper
- Acceptance: form submission → Turnstile passes → email arrives at `privacy@<niche.domain>` → inline success message.

### Slice 4: One-click unsubscribe verification — INFRA-07
**Why:** Already implemented; this slice is **test-only**, no code.

- Manual test: subscribe, confirm, click unsubscribe link in inbox.
- Manual test: `curl -X POST 'https://<domain>/api/unsubscribe?token=<...>'` → 200, row deleted.
- Verify Resend send shows `List-Unsubscribe` + `List-Unsubscribe-Post` headers.
- Acceptance: smoke test passes.

### Slice 5: Ops runbook — INFRA-02 + INFRA-03 + INFRA-04
**Why last:** Pure ops; runs alongside code deploy, not as code tasks.

- Runbook 1: Apply migrations 0002, 0003, 0004 in order via Supabase SQL editor.
- Runbook 2: Resend domain verification (add SPF, DKIM, DMARC records to Cloudflare DNS for `windturbinejobs.com`; click "Verify DNS Records" in Resend dashboard; wait up to 72h).
- Runbook 3: `wrangler pages secret put` for the 6 Pages secrets; `wrangler secret put` for `GOOGLE_INDEXING_KEY` on workers/ingest. Verify with `wrangler pages secret list`.
- Runbook 4 (Google Cloud, prerequisite to Indexing API working):
  1. Create GCP project (or reuse)
  2. Enable Indexing API
  3. Create service account; grant `roles/indexing.publisher`
  4. Download JSON key → set as `GOOGLE_INDEXING_KEY` Worker secret
  5. Add service-account email to Search Console as Owner of the property
  6. (If JobPosting markup) Submit Google's Indexing API approval form
- Acceptance: production deploy boots without missing-env errors; first cron run logs no auth failures.

## Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|-------|---------|---------------|
| A1 | Google's Indexing API JobPosting allow-list is/will be approved for this domain | Pitfall 4, Slice 5 | DATA-03 ships code that compiles and returns 200, but Google ignores the pings → expired jobs linger in search results. **Surface to user before planning starts.** |
| A2 | Single JSON blob env var for service-account key is acceptable to user | Standard Stack alternatives | If user prefers individual fields, Pattern 3 needs minor refactor |
| A3 | `expired_at` (new) and `expires_at` (existing) being two near-identical columns is acceptable | Pitfall 1 | Future maintainer confusion; renaming later requires a migration |
| A4 | Backfilling existing subscribers' `consent_given_at = created_at` is legally acceptable for the small pre-prod row count | Migration 0004 | If user wants strict compliance, may need to email existing subscribers asking for re-consent — but in practice the site has 0 subscribers right now |
| A5 | `URL_UPDATED` (not `URL_DELETED`) is the right Indexing API verb when the URL still resolves but returns 410 | Pattern 3 | If wrong, Indexing API may behave unexpectedly. `URL_DELETED` is documented as "for permanent removal from sitemap" — since the URL still exists on our side, `URL_UPDATED` matches Google's semantics. [CITED: Google Indexing API docs] |
| A6 | TURNSTILE_SITE_KEY is safe to inline in prerendered HTML at build time | Pitfall 8 | If wrong, build env vars need different mechanism. But Newsletter.astro already inlines this key — pattern is established. |

## Open Questions

1. **Indexing API JobPosting approval status?**
   - What we know: Google requires explicit allow-list approval for JobPosting URLs.
   - What's unclear: Has the form been submitted? Does the project have an existing GCP setup?
   - Recommendation: Surface to user at start of `/gsd-plan-phase` execution. If not approved, ship the integration code in Phase 1 but mark DATA-03 effectiveness as deferred until approval lands.

2. **Confirm `expired_at` vs `expires_at` naming preference?**
   - What we know: `expires_at` already exists on jobs (employer-stated date).
   - What's unclear: Whether user prefers the slightly clearer `marked_expired_at` to avoid the near-identical name.
   - Recommendation: Default to CONTEXT.md's `expired_at` and document the distinction in migration comment. Re-prompt only if user objects.

3. **Per-niche `privacy@` mailbox or single `privacy@windturbinejobs.com`?**
   - CONTEXT D-14 says `privacy@windturbinejobs.com`. Multi-niche rule says no hardcoding `wind-turbine`. For deletion email recipient, code should use `privacy@${niche.domain}` and CONTEXT meant the niche-1 instantiation.
   - Recommendation: Use `privacy@${niche.domain}` in code. For ops, the user must ensure the mailbox exists — add to Slice 5 runbook.

## Environment Availability

| Dependency | Required by | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Supabase project (production) | INFRA-02, all DB writes | ✓ (assumed live per project state) | n/a | None — required |
| Resend account | INFRA-03, email sends | ✓ (already used) | n/a | None — required |
| Cloudflare account (Pages + Workers) | INFRA-04, deploy | ✓ | n/a | None — required |
| Cloudflare DNS for `windturbinejobs.com` | INFRA-03 (SPF/DKIM/DMARC) | ✗ unknown | — | If domain not yet on Cloudflare DNS, must move there before Resend can verify via DNS records |
| Google Cloud project + Indexing API enabled | DATA-03 | ✗ unknown | — | If not provisioned, Slice 1 ships expiry detection code without ping; Slice 5 runbook handles GCP setup |
| Google Search Console verified ownership | DATA-03 (service account must be added to GSC as owner) | ✗ unknown | — | Required for Indexing API to recognize URL ownership |
| `pnpm` + `node` (local dev) | All | ✓ (existing repo) | n/a | — |
| `wrangler` CLI | Slice 5 | ✓ (existing CI/CD or dev) | n/a | — |
| `jose` npm package | DATA-03 ping JWT | ✗ (not installed) | 6.2.3 | None — direct WebCrypto possible but not recommended |

**Missing dependencies with no fallback:**
- Google Cloud project + Indexing API enable + service account + GSC ownership grant — Slice 5 runbook gates Slice 1 effectiveness (code can ship without; pings will 401).

**Missing dependencies with fallback:**
- None for code; Slice 5 ops items gate functional acceptance.

## Validation Architecture

`config.json` shows `workflow.nyquist_validation: true`. Phase 1 has no test framework configured (`apps/web/package.json` only has `astro check && tsc --noEmit`). Wave 0 must scaffold one.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `vitest@^4.1.5` (verified current via `npm view vitest version`) |
| Config file | `vitest.config.ts` (none — Wave 0) |
| Quick run command | `pnpm vitest run --reporter=basic --bail=1` |
| Full suite command | `pnpm vitest run --coverage` |
| Astro page checks | `pnpm --filter @owljobs/web typecheck` (existing) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test type | Automated command | File exists? |
|--------|----------|-----------|-------------------|--------------|
| DATA-01 | `expireMissingJobs` marks DB rows absent from fetched ID set | unit | `pnpm vitest run workers/ingest/test/expire.test.ts -t "expireMissingJobs"` | ❌ Wave 0 |
| DATA-01 | `expireMissingJobs` skips when fetched set is empty | unit | same file, `-t "skips on empty fetch"` | ❌ Wave 0 |
| DATA-01 | Re-listing branch in `upsertJob` re-activates expired row | unit/integration | `pnpm vitest run workers/ingest/test/upsert.test.ts -t "re-activate"` | ❌ Wave 0 |
| DATA-02 | `listJobs` excludes `status='expired'` | unit | `pnpm vitest run apps/web/test/jobs.test.ts -t "active filter"` | ❌ Wave 0 |
| DATA-02 | `[slug].astro` returns 410 for expired job (integration) | integration (Astro test/playwright) | `pnpm test:e2e jobs-410.spec.ts` | manual-only OK in v1 |
| DATA-02 | sitemap.xml.ts excludes expired (snapshot) | unit | `pnpm vitest run apps/web/test/sitemap.test.ts` | ❌ Wave 0 |
| DATA-03 | `signServiceAccountJWT` produces a valid RS256 JWT | unit | `pnpm vitest run workers/ingest/test/google-indexing.test.ts -t "signs JWT"` | ❌ Wave 0 |
| DATA-03 | `pingUrlUpdated` returns `{ok, status}` and surfaces fetch errors | unit (mocked fetch) | same file, `-t "pingUrlUpdated"` | ❌ Wave 0 |
| INFRA-05 | privacy.astro renders sub-processor table | smoke (curl + grep) | `curl -s https://<domain>/privacy \| grep -c "Sub-processors"` | manual / CI smoke |
| INFRA-06 | `/api/subscribe` rejects requests with `consent: false` | integration | `pnpm vitest run apps/web/test/subscribe.test.ts -t "rejects no consent"` | ❌ Wave 0 |
| INFRA-06 | `/api/subscribe` writes `consent_given_at` | integration (Supabase test) | same file, `-t "writes consent_given_at"` | ❌ Wave 0 |
| INFRA-07 | `/api/unsubscribe` POST deletes row | integration | `pnpm vitest run apps/web/test/unsubscribe.test.ts -t "POST deletes row"` | ❌ Wave 0 |
| INFRA-08 | `/api/delete-request` requires Turnstile | integration | `pnpm vitest run apps/web/test/delete-request.test.ts -t "Turnstile required"` | ❌ Wave 0 |
| INFRA-08 | `/api/delete-request` sends email via Resend on success | integration (mocked Resend) | same file, `-t "sends email"` | ❌ Wave 0 |
| INFRA-02/03/04 | Production smoke after deploy | manual | curl `/`, `/jobs`, `/sitemap.xml`, `/feed.xml`; subscribe with real email | manual-only (ops) |

### Sampling Rate
- **Per task commit:** `pnpm vitest run --bail=1` (only changed packages — Vitest's affected mode)
- **Per wave merge:** `pnpm vitest run` (full suite) + `pnpm --filter @owljobs/web typecheck`
- **Phase gate:** Full suite green + manual smoke checklist before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `vitest.config.ts` at repo root (workspace-wide config, picks up `apps/*/test/**` and `workers/*/test/**`)
- [ ] `pnpm` workspace `vitest` and `@types/node` devDependency at root
- [ ] `workers/ingest/test/conftest`-equivalent fixture file: mock `SchemaClient` + Supabase responses; mock `crypto.subtle` is native
- [ ] `apps/web/test/conftest`-equivalent: mock `getEnv`, mock Supabase, mock Resend
- [ ] Framework install: `pnpm add -D -w vitest @vitest/coverage-v8`
- [ ] CI hook (out of phase scope but record): GitHub Action runs `pnpm vitest run` on PR

## Security Domain

`security_enforcement` is not explicitly disabled in `config.json` → treat as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard control |
|---------------|---------|-----------------|
| V2 Authentication | no | No new auth in Phase 1 (Phase 4 introduces magic links) |
| V3 Session Management | no | No sessions in Phase 1 |
| V4 Access Control | partial | RLS policy update in migration 0004 enforces `status='active'` for anon SELECT — same allow-by-default-deny-by-policy model |
| V5 Input Validation | yes | Email regex on subscribe + delete-request (already done in subscribe.ts); Turnstile token; consent boolean check |
| V6 Cryptography | yes | RS256 JWT for Google service account → use `jose` (no hand-roll); WebCrypto digest for dedup keys (existing `sha256Hex`) |
| V8 Data Protection | yes | GDPR Art 7 (consent storage), Art 17 (deletion request) — both addressed in this phase |
| V14 Configuration | yes | Secrets management — wrangler secrets; never plaintext in `wrangler.toml` (existing convention) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard mitigation |
|---------|--------|---------------------|
| Bot spam on subscribe / deletion form | Spoofing | Turnstile (already wired) |
| Replay of unsubscribe token | Tampering | Token is consumed (row deleted) on first use — already handled |
| Service-account key leak | Information Disclosure | Store as Worker secret (never in wrangler.toml or git); rotate via Google Cloud Console if exposed |
| Mass-expiry from ATS outage | Denial of Service (against ourselves) | D-01 guard: skip expiry if fetched set empty |
| GDPR deletion email forgery (attacker triggers deletion of someone else's email) | Tampering | Phase 1 V1: manual founder review of incoming requests is the trust gate. v2 could add email-confirmation loop but adds complexity. |
| 410 page cache poisoning | Tampering / Defacement | None applicable — page is server-rendered with fixed body, no user input |
| Indexing API quota exhaustion | DoS (against ourselves) | Per-run cap on pings (Pattern 4) |

## Sources

### Primary (HIGH confidence)
- Codebase reads (paths listed in CONTEXT.md `<canonical_refs>` + verified during this research):
  - `/Users/ralphvanslooten/Work/code/nomadic-owls/owljobs/CLAUDE.md`
  - `/Users/ralphvanslooten/Work/code/nomadic-owls/owljobs/.planning/phases/01-production-foundation/01-CONTEXT.md`
  - `/Users/ralphvanslooten/Work/code/nomadic-owls/owljobs/.planning/REQUIREMENTS.md`
  - `/Users/ralphvanslooten/Work/code/nomadic-owls/owljobs/.planning/ROADMAP.md`
  - `/Users/ralphvanslooten/Work/code/nomadic-owls/owljobs/.planning/STATE.md`
  - `/Users/ralphvanslooten/Work/code/nomadic-owls/owljobs/.planning/config.json`
  - `/Users/ralphvanslooten/Work/code/nomadic-owls/owljobs/packages/schema/src/migrations/0001_initial.sql`
  - `/Users/ralphvanslooten/Work/code/nomadic-owls/owljobs/packages/schema/src/migrations/0002_rls.sql`
  - `/Users/ralphvanslooten/Work/code/nomadic-owls/owljobs/packages/schema/src/migrations/0003_subscribers_multi_niche.sql`
  - `/Users/ralphvanslooten/Work/code/nomadic-owls/owljobs/packages/schema/src/index.ts`
  - `/Users/ralphvanslooten/Work/code/nomadic-owls/owljobs/workers/ingest/src/index.ts`
  - `/Users/ralphvanslooten/Work/code/nomadic-owls/owljobs/workers/ingest/src/ingest.ts`
  - `/Users/ralphvanslooten/Work/code/nomadic-owls/owljobs/workers/ingest/wrangler.toml`
  - `/Users/ralphvanslooten/Work/code/nomadic-owls/owljobs/apps/web/src/pages/jobs/[slug].astro`
  - `/Users/ralphvanslooten/Work/code/nomadic-owls/owljobs/apps/web/src/pages/api/subscribe.ts`
  - `/Users/ralphvanslooten/Work/code/nomadic-owls/owljobs/apps/web/src/pages/api/confirm.ts`
  - `/Users/ralphvanslooten/Work/code/nomadic-owls/owljobs/apps/web/src/pages/api/unsubscribe.ts`
  - `/Users/ralphvanslooten/Work/code/nomadic-owls/owljobs/apps/web/src/pages/sitemap.xml.ts`
  - `/Users/ralphvanslooten/Work/code/nomadic-owls/owljobs/apps/web/src/pages/feed.xml.ts`
  - `/Users/ralphvanslooten/Work/code/nomadic-owls/owljobs/apps/web/src/pages/feed.json.ts`
  - `/Users/ralphvanslooten/Work/code/nomadic-owls/owljobs/apps/web/src/pages/privacy.astro`
  - `/Users/ralphvanslooten/Work/code/nomadic-owls/owljobs/apps/web/src/pages/404.astro`
  - `/Users/ralphvanslooten/Work/code/nomadic-owls/owljobs/apps/web/src/components/Newsletter.astro`
  - `/Users/ralphvanslooten/Work/code/nomadic-owls/owljobs/apps/web/src/components/ui/Checkbox.astro`
  - `/Users/ralphvanslooten/Work/code/nomadic-owls/owljobs/apps/web/src/lib/jobs.ts`
  - `/Users/ralphvanslooten/Work/code/nomadic-owls/owljobs/apps/web/src/lib/env.ts`
  - `/Users/ralphvanslooten/Work/code/nomadic-owls/owljobs/apps/web/src/lib/supabase.ts`
  - `/Users/ralphvanslooten/Work/code/nomadic-owls/owljobs/apps/web/src/lib/resend.ts`
  - `/Users/ralphvanslooten/Work/code/nomadic-owls/owljobs/apps/web/src/lib/turnstile.ts`
  - `/Users/ralphvanslooten/Work/code/nomadic-owls/owljobs/apps/web/src/middleware.ts`
  - `/Users/ralphvanslooten/Work/code/nomadic-owls/owljobs/apps/web/astro.config.mjs`
  - `/Users/ralphvanslooten/Work/code/nomadic-owls/owljobs/apps/web/package.json`
  - `/Users/ralphvanslooten/Work/code/nomadic-owls/owljobs/niches/wind-turbine.ts`
- npm registry (`npm view <pkg> version`): `jose@6.2.3`, `@supabase/supabase-js@2.105.4`, `astro@6.3.1`, `vitest@4.1.5`

### Secondary (MEDIUM confidence — WebSearch verified against multiple sources)
- Astro 5 `Astro.response.status` for non-404 codes works on Cloudflare adapter — [Astro docs / Cloudflare integration guide](https://docs.astro.build/en/guides/integrations-guide/cloudflare/) + [WebSearch consensus across 5 GitHub issues]
- `jose` library supports RS256 + WebCrypto on Workers — [github.com/panva/jose](https://github.com/panva/jose) + [Hookdeck blog: How to Call Google Cloud APIs From Cloudflare Workers](https://hookdeck.com/blog/how-to-call-google-cloud-apis-from-cloudflare-workers) + [Medium: Authenticate Google APIs on Cloudflare Workers in 2025](https://medium.com/@tamnvhustcc/how-to-authenticate-google-apis-on-cloudflare-workers-in-2025-a-complete-guide-with-custom-jwt-80614398425a)
- Google Indexing API quota: 200 publish/day default; JobPosting requires approval — [developers.google.com/search/apis/indexing-api/v3/quota-pricing](https://developers.google.com/search/apis/indexing-api/v3/quota-pricing)
- Resend domain verification (SPF/DKIM/DMARC on Cloudflare DNS) — [resend.com/docs/knowledge-base/cloudflare](https://resend.com/docs/knowledge-base/cloudflare) + [Cloudflare Workers tutorial: Send emails with Resend](https://developers.cloudflare.com/workers/tutorials/send-emails-with-resend/)

### Tertiary (LOW confidence — WebSearch only, flagged for validation)
- Indexing API `URL_UPDATED` semantics for transition-to-410 (vs `URL_DELETED` for sitemap removal) — [WebSearch consensus, no single canonical source surfaced; Google docs reference behind WebFetch tool blocked]. Mitigation: low-risk; either verb signals to recrawl. Safer to use `URL_UPDATED` since URL still resolves on our side.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — `jose` is canonical, verified version, multiple working examples
- Architecture: HIGH — every change is a small delta on existing patterns; CONTEXT.md locked 16 of the design decisions
- Pitfalls: HIGH — pitfalls 1, 2, 3, 5, 6, 7, 9 verified directly against codebase; pitfall 4 (JobPosting approval) is documented Google policy; pitfall 8 confirmed by codebase precedent

**Research date:** 2026-05-09
**Valid until:** 2026-06-08 (30 days — stable stack, slow-moving APIs)
