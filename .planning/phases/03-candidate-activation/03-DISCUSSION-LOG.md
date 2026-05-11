# Phase 3: Candidate Activation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-11
**Phase:** 3-candidate-activation
**Areas discussed:** Job matching logic, Email template, Subscriber acquisition (CAND-04), Digest worker architecture, RFC 8058 one-click unsubscribe, Subscribe form social proof, Post-confirm welcome message

---

## Job Matching Logic

| Option | Description | Selected |
|--------|-------------|----------|
| Jobs posted in last 7 days | Simple 7-day window, predictable | ✓ |
| Jobs not yet sent to subscriber | Per-subscriber tracking, more personalized | |

**User's choice:** Jobs posted in last 7 days

---

| Option | Description | Selected |
|--------|-------------|----------|
| Location filter when set, all jobs if NULL | Match subscribers.locations against job.location; NULL = all | ✓ |
| All jobs in niche, no location filter | Simpler, no filtering | |

**User's choice:** Location filter when set, all jobs if NULL

---

| Option | Description | Selected |
|--------|-------------|----------|
| Skip the send | No email on empty weeks | |
| Send "no new jobs" email | Keep weekly cadence consistent | ✓ |

**User's choice:** Send "no new jobs" email anyway

---

| Option | Description | Selected |
|--------|-------------|----------|
| Monday (weekly) | Standard job digest cadence | ✓ |
| Daily | Higher touchpoint risk | |

**Notes:** User initially asked about daily vs weekly vs 3x/week. After reviewing tradeoffs (thin job volume at early stage, sender reputation risk with daily), confirmed weekly for Phase 3. Frequency tuning deferred until engagement data available.

---

## Email Template

| Option | Description | Selected |
|--------|-------------|----------|
| Simple HTML | Branded, React Email compatible, better engagement | ✓ |
| Plain text only | Best deliverability, zero rendering issues | |

**User's choice:** Simple HTML

---

| Option | Description | Selected |
|--------|-------------|----------|
| All new jobs, capped at 20 | Full week's listings up to cap | ✓ |
| Top 10 (most recent) | Fixed short list | |

**User's choice:** All new jobs, capped at 20

---

| Option | Description | Selected |
|--------|-------------|----------|
| Title, company, location, apply link | Essentials only, clean | ✓ |
| Title, company, location, salary, posted date, apply link | More context but salary often null | |

**User's choice:** Title, company, location, apply link

---

| Option | Description | Selected |
|--------|-------------|----------|
| Dynamic subject with job count | "8 new wind turbine jobs this week" | ✓ |
| Fixed branding subject | "Wind Turbine Jobs — Weekly Digest" | |

**User's choice:** Dynamic subject with job count

---

| Option | Description | Selected |
|--------|-------------|----------|
| Wind Turbine Jobs <digest@windturbinejobs.com> | Brand-consistent sender | ✓ |
| Ralph from Wind Turbine Jobs <ralph@windturbinejobs.com> | Personal sender | |

**User's choice:** `Wind Turbine Jobs <digest@windturbinejobs.com>`

---

| Option | Description | Selected |
|--------|-------------|----------|
| Unsubscribe link + brand tagline | Minimal, compliant | ✓ |
| Unsubscribe + manage preferences + privacy policy | More subscriber control | |

**User's choice:** Unsubscribe link + short brand tagline

---

## Subscriber Acquisition (CAND-04)

| Option | Description | Selected |
|--------|-------------|----------|
| LinkedIn wind tech communities | Groups, GWEC/WindEurope followers | ✓ |
| GWO / trade forums | Reddit r/windpower, offshore wind forums | |
| Direct outreach to individual candidates | Personal LinkedIn messages | ✓ |
| Landing page / SEO organic | Rely on search traffic | ✓ |

**User's choice:** LinkedIn communities, direct candidate outreach, SEO organic

---

| Option | Description | Selected |
|--------|-------------|----------|
| Form is fine as-is | No changes | |
| Add social proof / job count | "420+ jobs from 20+ employers" near form | ✓ |

**User's choice:** Add social proof to subscribe form

---

| Option | Description | Selected |
|--------|-------------|----------|
| STATE.md metric + manual Supabase query | No build cost | ✓ |
| Admin endpoint showing live subscriber count | Protected route on web app | |

**User's choice:** STATE.md metric + manual Supabase query

---

## Digest Worker Architecture

| Option | Description | Selected |
|--------|-------------|----------|
| New standalone workers/digest/ | Clean separation, own deploy | ✓ |
| Extend workers/ingest/ | Simpler but bad coupling | |

**User's choice:** New standalone `workers/digest/`

---

| Option | Description | Selected |
|--------|-------------|----------|
| max_batch_size: 1 (one subscriber per message) | Simplest, easy retry | |
| max_batch_size: 10 (batch of 10) | More efficient at scale | ✓ |

**User's choice:** max_batch_size: 10

---

| Option | Description | Selected |
|--------|-------------|----------|
| Add sent_date DATE column + unique constraint | Clean, queryable | ✓ |
| Functional index on DATE(sent_at) | No new column | |

**User's choice:** Add `sent_date DATE` column + `UNIQUE(subscriber_id, sent_date, type)`

---

| Option | Description | Selected |
|--------|-------------|----------|
| Log error, skip subscriber, continue batch | Tolerant per-subscriber | ✓ |
| Fail entire queue message on any error | All-or-nothing retry | |

**User's choice:** Log and skip failed subscriber

---

| Option | Description | Selected |
|--------|-------------|----------|
| Multi-niche from day one | Use getAllNiches(), no hardcoding | ✓ |
| Wind-turbine-only for Phase 3 | Faster but violates hard rule | |

**User's choice:** Multi-niche from day one

---

## RFC 8058 One-Click Unsubscribe

| Option | Description | Selected |
|--------|-------------|----------|
| New POST /api/unsubscribe-oneclick | Separate endpoint, clean | ✓ |
| Extend existing /api/unsubscribe to handle POST | One less file | |

**User's choice:** New `POST /api/unsubscribe-oneclick`

---

| Option | Description | Selected |
|--------|-------------|----------|
| Set confirmed_at = NULL (soft unsubscribe) | Row preserved, re-subscribe works | ✓ |
| Delete the row entirely | Clean but breaks FK references | |

**User's choice:** Soft unsubscribe (set `confirmed_at = NULL`)

---

## Subscribe Form Social Proof

| Option | Description | Selected |
|--------|-------------|----------|
| Static text updated manually | Zero overhead | ✓ |
| Dynamic via Supabase count query | Always accurate but adds DB call | |

**User's choice:** Static text, manually updated

---

## Post-Confirm Welcome Message

| Option | Description | Selected |
|--------|-------------|----------|
| Only confirmation success page, no extra email | Less is more | ✓ |
| Welcome email with next-digest date | Sets expectations | |

**User's choice:** Confirmation success page only, no welcome email

---

## Claude's Discretion

- React Email component structure for digest template
- HTML/CSS styling (following existing confirmation email conventions)
- Error log format in digest worker
- Queue retry/deadletter configuration details in wrangler.toml

## Deferred Ideas

- Digest frequency tuning (daily, 3x/week) — revisit Phase 4/5 after engagement data
- Admin subscriber count endpoint — manual Supabase query sufficient for Phase 3
- Welcome email after confirmation — consider Phase 4 if engagement is low
- Manage preferences page (footer link) — Phase 4 or 5
- UTM tracking on digest links — Phase 4
