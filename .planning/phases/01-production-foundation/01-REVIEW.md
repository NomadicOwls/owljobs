---
phase: 01-production-foundation
reviewed: 2026-05-10T00:00:00Z
depth: standard
files_reviewed: 21
files_reviewed_list:
  - apps/web/src/components/Newsletter.astro
  - apps/web/src/lib/jobs.ts
  - apps/web/src/lib/resend.ts
  - apps/web/src/pages/api/delete-request.ts
  - apps/web/src/pages/api/subscribe.ts
  - apps/web/src/pages/jobs/[slug].astro
  - apps/web/src/pages/privacy.astro
  - apps/web/test/delete-request.test.ts
  - apps/web/test/jobs.test.ts
  - apps/web/test/subscribe.test.ts
  - packages/schema/src/index.ts
  - packages/schema/src/migrations/0004_stale_jobs_consent.sql
  - packages/schema/test/types.test.ts
  - workers/ingest/src/expire.ts
  - workers/ingest/src/google-indexing.ts
  - workers/ingest/src/index.ts
  - workers/ingest/src/ingest.ts
  - workers/ingest/test/expire.test.ts
  - workers/ingest/test/google-indexing.test.ts
  - workers/ingest/test/upsert.test.ts
  - vitest.config.ts
findings:
  critical: 3
  warning: 3
  info: 1
  total: 7
status: fixed
fixed_at: 2026-05-10T00:00:00Z
---

# Phase 01: Code Review Report

**Reviewed:** 2026-05-10T00:00:00Z
**Depth:** standard
**Files Reviewed:** 21
**Status:** issues_found

## Summary

Phase 1 added stale-job expiry with Google Indexing API pings, GDPR consent on subscribe, a data-deletion request endpoint, and email infrastructure. The ingest worker expiry/cleanup logic and the Google Indexing JWT flow are solid. However, three critical issues require fixing before any public traffic: unsanitized employer HTML rendered via `set:html`, re-subscription clobbering confirmed subscribers (un-confirms them and rotates unsubscribe links in sent mail), and HTML injection in the GDPR deletion email body.

---

## Critical Issues

### CR-01: Unsanitized employer HTML rendered with `set:html` — stored XSS

**Status:** fixed — commit 31b85e4

**File:** `apps/web/src/pages/jobs/[slug].astro:207`

**Issue:** `job.description` is rendered verbatim with `set:html={job.description}`. Greenhouse and Softgarden adapters write the raw ATS HTML directly into `jobs.description` with no sanitization step (`ingest.ts:161`, `ingest.ts:329`). An employer's ATS system (or a compromised feed) can inject arbitrary JavaScript that executes in every visitor's browser. CLAUDE.md hard rule: "HTML sanitization: Use `dompurify` (Workers no-DOM mode) on all employer-editable content."

**Fix:** Sanitize before persisting in the ingest worker (preferred, keeps the DB clean) or sanitize at render time. In the ingest worker, after fetching `job.description` from the adapter:

```typescript
// workers/ingest/src/ingest.ts — at the top of the file
import { JSDOM } from "jsdom";
import DOMPurify from "dompurify";

function sanitizeHtml(html: string): string {
  const window = new JSDOM("").window;
  const purify = DOMPurify(window as any);
  return purify.sanitize(html, { ALLOWED_TAGS: ["p","br","ul","ol","li","strong","em","h2","h3","h4","a"], ADD_ATTR: ["href"] });
}
```

Or for the Worker edge environment (no DOM), use `dompurify` in Workers no-DOM mode as specified in CLAUDE.md. At minimum, guard the template:

```astro
<!-- [slug].astro — do not use until sanitization is in place -->
{job.description ? (
  <div class="job-description mt-4 leading-relaxed text-muted-foreground"
       set:html={sanitized} />
```

---

### CR-02: Re-subscription upsert un-confirms existing confirmed subscribers and rotates sent unsubscribe tokens

**Status:** fixed — commit 70870fd

**File:** `apps/web/src/pages/api/subscribe.ts:44–60`

**Issue:** The upsert writes `ignoreDuplicates: false` with `onConflict: "email,niche"`, which means a conflict triggers an UPDATE of all columns including `confirmed_at: null`, a new `confirmation_token`, and a new `unsubscribe_token`. Consequences:

1. A confirmed subscriber who re-submits the form (or whose email is submitted by an attacker) is silently un-confirmed and re-queued for confirmation email.
2. Every unsubscribe link in emails already sent to that subscriber stops working (the token in those emails no longer matches the DB row) — a GDPR compliance failure.
3. The comment on lines 67–68 ("Fetch the current (possibly pre-existing) confirmation token") is wrong: the SELECT returns the values that were just written, not the pre-existing ones.

The downstream SELECT-after-upsert at lines 69–74 reads the newly-written tokens, so `actualConfirmToken` and `actualUnsubToken` are always the freshly-generated values regardless of prior state — the fallback to `confirmationToken`/`unsubscribeToken` (lines 76–77) is always unused.

**Fix:** Use `ignoreDuplicates: true` so that a re-submission is a no-op on the row, then select the existing tokens to send the confirmation email:

```typescript
const { error: upsertError } = await db
  .schema(niche.supabaseSchema)
  .from("subscribers")
  .upsert(
    {
      id: crypto.randomUUID(),
      email,
      niche: niche.id,
      confirmation_token: confirmationToken,
      unsubscribe_token: unsubscribeToken,
      confirmed_at: null,
      locations: null,
      created_at: new Date().toISOString(),
      consent_given_at: new Date().toISOString(),
    },
    { onConflict: "email,niche", ignoreDuplicates: true },
  );

if (upsertError) { /* ... */ }

// Now fetch the actual (pre-existing or just-inserted) tokens
const { data: subData } = await db
  .schema(niche.supabaseSchema)
  .from("subscribers")
  .select("confirmation_token, unsubscribe_token, confirmed_at")
  .eq("email", email)
  .eq("niche", niche.id)
  .single();

// Already confirmed — no need to resend
if (subData?.confirmed_at) {
  return Response.json({ message: "You're already subscribed." });
}
```

---

### CR-03: HTML injection in GDPR deletion request email body

**Status:** fixed — commit 095e7ca

**File:** `apps/web/src/lib/resend.ts:105`

**Issue:** `opts.requesterEmail` is interpolated raw into an HTML email body:

```typescript
<p><strong>Requester email:</strong> ${opts.requesterEmail}</p>
```

The email regex used in `delete-request.ts` (`^[^\s@]+@[^\s@]+\.[^\s@]+$`) allows `<`, `>`, `"`, and `'` in the local part. Confirmed via regex test: `a<b>c@d.e` passes. A malicious actor can submit `<script>alert(1)</script>@attacker.com` and inject arbitrary HTML into the founder's inbox. Email clients that render HTML (the email is sent as `text/html`) will execute it.

**Fix:** HTML-encode the email address before embedding:

```typescript
function htmlEncode(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// In sendDeletionRequest:
html: `
  <p>A user has requested deletion of their personal data under GDPR Article 17.</p>
  <p><strong>Requester email:</strong> ${htmlEncode(opts.requesterEmail)}</p>
  ...
`
```

---

## Warnings

### WR-01: `privacy.astro` hardcodes "Wind Turbine Jobs" and `privacy@windturbinejobs.com` — multi-niche violation

**Status:** fixed — commit 7f0ebcb

**File:** `apps/web/src/pages/privacy.astro:12,21,91,109`

**Issue:** The page is `export const prerender = true` but it reads `env` and `niche` is available via `Astro.locals`. The privacy policy text hardcodes "Wind Turbine Jobs" (lines 12, 21), `privacy@windturbinejobs.com` (line 91), and "May 2025" (line 109). CLAUDE.md: "Never hardcode `wind_turbine` schema in new code." When a second niche is added, this page will show the wrong brand to users of that niche.

**Fix:** The page is prerendered so `Astro.locals.niche` is not available at build time — but the env read on line 6 (`getEnv(Astro.locals)`) suggests it was intended to be SSR. Either:
- Remove `export const prerender = true` and template `niche.name`/`niche.domain` from `Astro.locals`.
- Or make a per-niche prerendered copy via dynamic routing (not recommended — complex).

At minimum, replace the hardcoded contact email and site name with props/locals before the second niche goes live.

---

### WR-02: `/jobs.json` debug endpoint returns expired jobs

**Status:** fixed — commit 8fcac4b

**File:** `workers/ingest/src/index.ts:166–175`

**Issue:** The `/jobs.json` handler has no `.eq("status", "active")` filter. It returns all jobs including `status='expired'` rows. Every other query in the codebase (listJobs, listFeedJobs, listSitemapJobs, listEmployerJobs) consistently filters `status='active'`. The comment says "production traffic goes through workers/api," but this endpoint is live and reachable.

**Fix:** Add the status filter:

```typescript
const { data, error } = await db
  .from("jobs")
  .select("id, title, employer_id, location, country, posted_at, canonical_url, is_sponsored, classification_score, classifier")
  .eq("status", "active")   // add this
  .order("is_sponsored", { ascending: false })
  .order("posted_at", { ascending: false })
  .limit(100);
```

---

### WR-03: `wrangler.toml` queue consumers use `max_batch_size = 10` — violates CLAUDE.md email digest pattern

**Status:** fixed — commit 60efcb7

**File:** `workers/ingest/wrangler.toml:25,30`

**Issue:** CLAUDE.md hard rule: "Email digest pattern: Cron → Queue (max_batch_size: 2) → Resend. Never loop-and-send in the cron handler (30s CPU cap)." Both `owljobs-classify` and `owljobs-enrich` consumers are configured with `max_batch_size = 10`. These are not the email digest queues, but the pattern comment suggests 2 was the deliberate limit for the *ingest* queues driving downstream email sends. If a future enrich step triggers email sends, `max_batch_size = 10` would violate the CPU-cap constraint. The classify/enrich queues processing 10 niches simultaneously could also exhaust the Worker CPU budget if any niche has a large backlog.

**Fix:** Confirm whether `max_batch_size = 2` is intended only for the email digest queue (not yet added) or for all queues. If classify/enrich do no email sending, document the intent. If a separate email-digest queue is planned, ensure it is configured with `max_batch_size = 2` when added.

---

## Info

### IN-01: `subscribe.ts` SELECT-after-upsert fallback values are always unreachable dead code

**File:** `apps/web/src/pages/api/subscribe.ts:76–77`

**Issue:** The nullish-coalescing fallbacks `?? confirmationToken` and `?? unsubscribeToken` on lines 76–77 are unreachable in all paths. When the upsert succeeds, the subsequent SELECT (`subData`) returns the row that was just written (either newly inserted or, with `ignoreDuplicates: false`, overwritten). With `ignoreDuplicates: false` (current behavior), the SELECT always returns the newly generated tokens, making the fallbacks dead. With `ignoreDuplicates: true` (correct behavior per CR-02), the SELECT returns the pre-existing tokens for returning subscribers, and the just-inserted tokens for new subscribers — neither path produces `null` from the SELECT unless the SELECT itself fails, which is not handled.

**Fix:** After fixing CR-02, simplify to:

```typescript
const confirmUrl = `https://${niche.domain}/api/confirm?token=${subData.confirmation_token}`;
const unsubscribeUrl = `https://${niche.domain}/api/unsubscribe?token=${subData.unsubscribe_token}`;
```

And handle the case where `subData` is null (SELECT failed) as an error rather than silently falling back to freshly-generated tokens that are not in the DB.

---

_Reviewed: 2026-05-10T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
