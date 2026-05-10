# Phase 2: Employer Breadth & SEO - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-10
**Phase:** 02-employer-breadth-seo
**Areas discussed:** Discovery script format, Adzuna integration pattern, JSON-LD missing fields, Path to 20+ employers

---

## Discovery Script Format

| Option | Description | Selected |
|--------|-------------|----------|
| Local CLI | pnpm script run from dev machine, Node.js, outputs to console/JSON, no Worker needed | |
| Worker HTTP endpoint | New Cloudflare Worker with HTTP trigger, edge-native, on-demand triggered | ✓ |

**User's choice:** Worker HTTP endpoint

### Input to discovery Worker

| Option | Description | Selected |
|--------|-------------|----------|
| HTTP request body | POST `{ employers: [{name, url}] }`, stateless, no DB needed | |
| Reads from DB | Worker reads `candidates` table in Supabase, founder adds employers there first | ✓ |
| Query string (single) | GET `/probe?url=...`, one employer at a time, easy to test but tedious for bulk | |

**User's choice:** Reads from DB

### Discovery output destination

| Option | Description | Selected |
|--------|-------------|----------|
| Writes results back to DB | Updates `candidates` table with ATS type, confidence, probe timestamp | ✓ |
| Returns JSON in HTTP response | Ephemeral — results in response body only, not persisted | |

**User's choice:** Writes results back to DB

### Discovery trigger mode

| Option | Description | Selected |
|--------|-------------|----------|
| On-demand only | Founder triggers via HTTP POST, no cron | ✓ |
| Scheduled + on-demand | Nightly cron + HTTP trigger | |

**User's choice:** On-demand only

---

## Adzuna Integration Pattern

### Pipeline integration

| Option | Description | Selected |
|--------|-------------|----------|
| New AtsTarget type in NicheConfig | `atsType: 'adzuna'` peers with native ATS targets, flows through classify→enrich pipeline | ✓ |
| Separate aggregator fetch path | Explicit separate code path, runs after native ATS fetches | |

**User's choice:** New AtsTarget type in NicheConfig (Recommended)

### Duplicate handling

| Option | Description | Selected |
|--------|-------------|----------|
| Existing dedup key handles it | SHA-256 PK conflict on upsert silently skips duplicates | ✓ |
| Skip Adzuna if native ATS coverage exists | Pre-check before fetching, prevents redundant API calls | |

**User's choice:** Existing dedup key handles it (Recommended)

### Aggregator choice

| Option | Description | Selected |
|--------|-------------|----------|
| Adzuna only | Free tier 250 calls/day, matches REQUIREMENTS.md | |
| JSearch instead | RapidAPI-hosted, broader coverage | |
| Both — Adzuna primary, JSearch fallback | Two API keys, broader coverage for thin-result queries | ✓ |

**User's choice:** Both — Adzuna primary, JSearch fallback

---

## JSON-LD Missing Fields

### jobLocation strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Omit when missing | Only include when DB has real city/region data | ✓ |
| Country-level fallback | Use employer's country when specific location missing | |
| Parse from job title/content | Regex extraction from text, fragile | |

**User's choice:** Omit jobLocation when missing (Recommended)

### Un-enriched jobs

| Option | Description | Selected |
|--------|-------------|----------|
| Skip JSON-LD entirely | No `<script type="application/ld+json">` block when description IS NULL | ✓ |
| Use stub description | Generated stub text, risks thin-content penalty | |

**User's choice:** Skip JSON-LD entirely for un-enriched jobs (Recommended)

### validThrough field

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, estimate 30 days from datePosted | `posted_at + 30 days`, reduces stale listing noise in Google for Jobs | ✓ |
| No, omit validThrough | Safer for long-running postings | |

**User's choice:** Yes, estimate 30 days from datePosted

---

## Path to 20+ Employers

### Primary gap-filling strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Adzuna+JSearch fills the gap | Activate Wave 1, use aggregator for remainder, no new adapter development | ✓ |
| Build 1-2 new adapters first | iCIMS + SmartRecruiters, each unlocks multiple employers | |
| Manual research + add more employers | Discovery script output → founder manually adds to wind-turbine.ts | |

**User's choice:** Adzuna+JSearch fills the gap (Recommended)
**Notes:** Subsequently decided to also build SmartRecruiters adapter in Phase 2 (high leverage, public API)

### Siemens Energy (Workday 401)

| Option | Description | Selected |
|--------|-------------|----------|
| Aggregator covers it | Adzuna/JSearch surfaces SE jobs via keyword queries | |
| Build a scraper workaround | Reverse-engineer Workday auth (OVERRIDDEN — violates Phase 1 anti-pattern) | |
| Note SE as a partnership target | Skip Phase 2; approach for partnership at Phase 5 | ✓ |

**User's choice:** Initially selected "Build a scraper workaround" — overridden by Phase 1 anti-pattern (STATE.md: "Do NOT continue scraping Workday — convert high-value targets to partnership conversation"). User agreed to "Note SE as a partnership target" instead.

### Done target

| Option | Description | Selected |
|--------|-------------|----------|
| 20 native + aggregator fills to 50 | Hard gate: 20 distinct employers in DB; target 50 via Adzuna/JSearch | ✓ |
| 20 native ATS only | Stricter — aggregator jobs don't count | |
| 50 native + unlimited aggregator | Ambitious, likely out of scope for one phase | |

**User's choice:** 20 native + aggregator fills to 50 (Recommended)

### SmartRecruiters adapter

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — build it in Phase 2 | Public REST API, no auth, unlocks multiple employers | ✓ |
| No — aggregator covers it | Less effort, lower data quality | |

**User's choice:** Yes — build it in Phase 2 (Recommended)

### Ørsted / Trakstar

| Option | Description | Selected |
|--------|-------------|----------|
| Aggregator-only for now | Adzuna/JSearch covers Ørsted jobs | |
| Build Trakstar adapter (token extraction) | Acknowledged as fragile; abort and fall back to aggregator if token flow requires full OAuth | ✓ |

**User's choice:** Build a Trakstar adapter using token extraction
**Notes:** Flagged as fragile. CONTEXT.md notes: if token extraction proves unreliable, fall back to aggregator. `cronGroup: "every3h"` to reduce probing frequency.

---

## Claude's Discretion

- `candidates` table exact schema (fields: id, name, careers_url, ats_type, confidence, probed_at, status, notes)
- SmartRecruiters company ID lookup strategy (parse from career page HTML)
- Trakstar token extraction approach (check `window.__INITIAL_STATE__` or `data-*` attributes)
- Adzuna/JSearch response normalization to match internal job row format
- Discovery Worker ATS signature detection heuristics and confidence scoring thresholds

## Deferred Ideas

- iCIMS adapter (Quanta Services) — deferred post-Phase 2; aggregator covers
- Siemens Energy partnership outreach — deferred to Phase 5 (≥100 subscribers needed for credible pitch)
- Emply adapter (Semco Maritime) — niche Scandinavian ATS, no public API documented, deferred
- Workday private tenant workaround — anti-pattern per Phase 1 research; do not attempt
