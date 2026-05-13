# OwlJobs Roadmap

---

## Phase 0 — Launch (unblock now)

The frontend is built. These are non-code steps blocking deploy.

- [ ] Apply DB migrations 0002 (RLS) + 0003 (subscriber tokens) in Supabase SQL editor
- [x] Register domain (`mywindturbinejobs.com`)
- [ ] Verify sending domain in Resend (SPF / DKIM / DMARC)
- [ ] Create Cloudflare Turnstile widget → copy site key + secret
- [ ] Create `apps/web/.dev.vars` with all 6 env vars
- [ ] `wrangler pages secret put` for all secrets in production
- [ ] Create `public/og-default.png` (1200×630 branded image)
- [ ] Point domain to Cloudflare Pages + verify TLS

**Goal:** site live at mywindturbinejobs.com, candidates can browse jobs and subscribe.

---

## Phase 1 — Data (fill the board)

A job board with 3 employers and ~30 relevant jobs is not a product yet.
The goal of this phase is enough volume that a candidate visiting the site
finds something useful.

**Add ATS targets**
- Work through `docs/eia860-new-candidates.md` top-to-bottom (sorted by MW)
- For each: visit careers page → identify ATS → add to `niches/wind-turbine.ts`
- Priority order: OEMs first, O&M contractors second, large operators third
- Target: 20–30 employers configured → ~500–1000 relevant jobs

**Wire up aggregator queries**
- `aggregatorQueries` is already defined in the niche config but not yet wired
- Add Adzuna adapter to fetch jobs by query keyword
- Use as discovery supplement, not primary source
- Run the classifier hard on aggregator results to cut noise

**Job descriptions**
- Jobs currently have no `description` field — they're title + location + URL
- Re-fetch detail pages from ATS canonical URLs to extract description text
- Store in `jobs.description` — unlocks Google for Jobs (JSON-LD) and better classification

---

## Phase 2 — Discoverability (get found)

Once there's enough data, make Google work for you.

**Google for Jobs (JSON-LD)**
- Add `JobPosting` structured data to `/jobs/[slug]`
- Requires `description` (Phase 1 blocker) — do not ship without it
- Validate in Google Rich Results Test before deploying

**Full-text search + filters**
- Add `tsvector` column to `jobs` table, populate at ingest
- Filter UI on `/jobs`: keyword, location, country, employer
- This is the biggest UX gap on the frontend right now

**OG images per job**
- Auto-generate per-job Open Graph images (Satori or Cloudflare Images)
- Improves click-through when jobs are shared on LinkedIn/WhatsApp

**Analytics**
- Add Cloudflare Web Analytics or Plausible (both GDPR-safe, no consent banner needed)
- Before this: flying blind on what candidates actually search for

---

## Phase 3 — Retention + Revenue

**Weekly digest worker**
- `workers/digest` — send confirmed subscribers a weekly email of new relevant jobs
- Subscribers table already exists; Resend is already integrated
- This is the highest-leverage retention mechanism for a job board

**Featured employer posts (v1 revenue)**
- Admin-managed: employer emails you → you set `is_sponsored = true, featured_until = date`
- No Stripe, no self-serve — just manual for v1
- Price point: €300–500 per post

**Employer self-serve (v2 revenue)**
- Stripe checkout → employer creates account → submits job → goes live after admin approval
- Subscription tier for unlimited posts

---

## Phase 4 — Portfolio (the actual business)

**Second niche**
- Use the niche provisioning script to scaffold a new vertical
- Candidates: solar O&M, offshore wind, HVAC, elevator mechanics (all share the "small talent pool, fragmented employer landscape" thesis)
- Each niche is a standalone site — same ingest/classify engine, different brand + domain

**Repeat**
- Each niche can be operated independently or sold off
- The moat is the employer relationships + classified job corpus, not the tech

---

## What's blocking what

```
Phase 0 (deploy)
  └── Phase 1 (data volume)
        └── Phase 2 (Google for Jobs) ← needs descriptions
        └── Phase 3 (digest) ← needs subscribers from live site
              └── Phase 3 (revenue)
                    └── Phase 4 (new niches)
```

Phase 2 search/filters and analytics can start as soon as the site is live.
Everything else flows from having real users on a live site.

---

## Out of scope (not on the roadmap)

- Candidate profiles / saved jobs / applications — job boards that go this direction
  compete with LinkedIn; we don't
- Mobile app — the web is enough, candidates use desktop for job searching
- Employer brand pages with photos/videos — v3 at the earliest
