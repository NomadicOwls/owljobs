# Phase 1: Production Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-09
**Phase:** 01-Production Foundation
**Areas discussed:** Stale job expiry mechanism, GDPR deletion request flow, Consent checkbox wording & UX, Google Indexing API scope in Phase 1

---

## Stale Job Expiry Mechanism

### Detection

| Option | Description | Selected |
|--------|-------------|----------|
| Compare IDs each run | After fetching all current jobs from ATS, compute set of IDs no longer returned and mark those expired | ✓ |
| Periodic re-check via HEAD/GET per job URL | Separate cron polls each live job's canonical URL | |
| Rely on ATS-provided expiry date | Only works for some ATS feeds, incomplete coverage | |

**User's choice:** Compare IDs each run

### Delete behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Soft-delete with expired_at timestamp | Set expired_at = NOW(); row kept for audit trail and 410 handling | ✓ |
| Hard delete from DB | Row removed entirely; no audit trail | |

**User's choice:** Soft-delete with expired_at timestamp

### Schema change

| Option | Description | Selected |
|--------|-------------|----------|
| Add status column | status TEXT DEFAULT 'active' CHECK (status IN ('active','expired')) via migration 0004 | ✓ |
| Reuse expires_at only | Set expires_at = NOW() to mark expiry; conflates user-specified close date with ATS removal | |

**User's choice:** Add status column

### Expiry trigger location

| Option | Description | Selected |
|--------|-------------|----------|
| Same ingest cron handler | Runs after each employer ATS fetch succeeds; no new wrangler.toml entry | ✓ |
| Separate dedicated cron | Distinct scheduled trigger for expiry only | |

**User's choice:** Same ingest cron handler

### Error handling

| Option | Description | Selected |
|--------|-------------|----------|
| Only expire if fetch succeeded with 1+ results | Skip on error/empty response; prevents mass-expiry from transient ATS downtime | ✓ |
| Expire immediately on any absence | Simple but risks mass-expiry on ATS downtime | |

**User's choice:** Only expire if fetch succeeded with 1+ results

### Expired page UX

| Option | Description | Selected |
|--------|-------------|----------|
| HTTP 410 + "This job is no longer available" page | Correct Google signal; shows message with link back to listings | ✓ |
| HTTP 410 + redirect to homepage | 410 may not register if redirect fires first | |
| HTTP 404 | Technically incorrect; slower Google deindexing | |

**User's choice:** HTTP 410 + "This job is no longer available" page

### Re-listing behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Re-activate existing row | Set status='active', clear expired_at; same slug preserved | ✓ |
| Treat as new job | Insert new row; old row stays as tombstone | |

**User's choice:** Re-activate existing row

### Expired row retention

| Option | Description | Selected |
|--------|-------------|----------|
| 90 days, then hard-delete | Cleanup cron hard-deletes after 90 days | ✓ |
| Keep forever | Simple but DB grows indefinitely | |
| Hard-delete immediately | Row removed on expiry; 410 needs tombstone mechanism | |

**User's choice:** 90 days, then hard-delete

### Cleanup trigger location

| Option | Description | Selected |
|--------|-------------|----------|
| Same ingest cron handler | Final step in existing scheduled handler | ✓ |
| Separate scheduled trigger | Distinct cron entry | |

**User's choice:** Same ingest cron handler

---

## GDPR Deletion Request Flow

### Submission mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Form on /privacy that emails the founder | Simple form; founder manually processes deletion within 30 days | ✓ |
| Form → API that auto-deletes from Supabase | Fully automated; more code | |
| Just a mailto: link on privacy page | Minimal change; slightly lower credibility | |

**User's choice:** Form on /privacy that emails the founder

### Email address and confirmation

| Option | Description | Selected |
|--------|-------------|----------|
| Send to privacy@windturbinejobs.com, inline success message | Simple; no confirmation email to requester | ✓ |
| Send to founder's personal email | Practical for now; privacy@ set up later | |
| Send to privacy@ AND confirmation email to requester via Resend | More complete UX; requires Resend call | |

**User's choice:** Send to privacy@windturbinejobs.com, show inline success message

### Form placement

| Option | Description | Selected |
|--------|-------------|----------|
| Embedded in /privacy at the bottom | Natural location; no new route | ✓ |
| Separate /gdpr-request page | Dedicated route; cleaner if privacy page gets long | |

**User's choice:** Embedded in /privacy at the bottom

### Bot protection

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — add Turnstile | Prevents abuse; reuses existing TURNSTILE_SITE_KEY | ✓ |
| No — skip Turnstile | Simpler; deletion requests are low-volume | |

**User's choice:** Add Turnstile

---

## Consent Checkbox Wording & UX

### Checkbox text

| Option | Description | Selected |
|--------|-------------|----------|
| "I agree to receive wind turbine job alerts by email. I can unsubscribe at any time." | Clear; job alerts only; no marketing consent bundled | ✓ |
| "I agree to the Privacy Policy and consent to receive job alert emails." | Bundles policy acceptance with consent | |
| Custom wording | User specifies | |

**User's choice:** "I agree to receive wind turbine job alerts by email. I can unsubscribe at any time." + Privacy Policy link

### Required field

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — required | Can't subscribe without checking; clean GDPR consent signal | ✓ |
| No — optional | Reduces friction but GDPR violation for email alerts | |

**User's choice:** Yes — required

### Privacy policy link

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — link to /privacy | Standard pattern; GDPR transparency | ✓ |
| No link | Simpler but less transparent | |

**User's choice:** Yes — link to /privacy

### DB storage of consent

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — store consent_given_at TIMESTAMPTZ | Add to subscribers table via migration 0004; GDPR accountability | ✓ |
| No — implicit from double opt-in | Weaker audit trail; confirmed_at exists but no consent timestamp | |

**User's choice:** Yes — store consent_given_at timestamp

---

## Google Indexing API Scope in Phase 1

### Integration scope

| Option | Description | Selected |
|--------|-------------|----------|
| Full integration now — 410 + sitemap removal + Google ping | Set up service account + GOOGLE_INDEXING_KEY; covers DATA-03 fully; Phase 2 adds creation/update pings | ✓ |
| Partial — 410 + sitemap removal only, defer ping | Simpler Phase 1; delays Google deindexing of expired jobs | |

**User's choice:** Full integration now

### Ping trigger location

| Option | Description | Selected |
|--------|-------------|----------|
| Synchronously in ingest worker after marking jobs expired | Simple; Google API is fast; failure logged, non-fatal | ✓ |
| Via existing enrich queue | Adds complexity; wrong semantic fit for enrich queue | |

**User's choice:** Synchronously in ingest worker

---

## Claude's Discretion

- Exact Supabase query shape for expiry detection (joining jobs + job_sources to compare external ATS IDs)
- Google Indexing API auth approach (service account JSON in env vs. individual fields)
- Privacy page layout for the deletion form — keep it inline below existing content

## Deferred Ideas

None — discussion stayed within phase scope.
