# Feature Landscape

**Domain:** Niche job board with employer subscriptions (vertical: wind turbine technicians)
**Researched:** 2026-05-09
**Project:** OwlJobs / Wind Turbine Jobs
**Pricing target:** EUR 500-2000+/month per employer
**Confidence:** MEDIUM-HIGH (anchored to documented patterns at Dice, RemoteOK, WeWorkRemotely, Handshake; LOW for wind-specific benchmarks since no incumbent exists)

---

## Strategic Frame

OwlJobs sells **FOMO + audience access**, not job posts. Free-tier ATS-ingested listings are already on the site. The paid product is the right to **outdisplay competitors** + **reach the candidate audience directly** + **own the company narrative** on-site.

This shapes the feature set: pay-to-pin and pay-to-control trump pay-to-post. Employers cannot pay to be the only ones present (the unfair advantage is the aggregated competitor list); they pay to be the most visible, most branded, and most actively notified.

---

## Tier Convention (used throughout)

Industry standard is a 3-tier ladder (Basic / Pro / Premium) with the middle tier as decoy and top tier as the target. Confirmed at Dice, WeWorkRemotely (Good/Better/Best), Stack Overflow Talent (historically). OwlJobs should follow this. Suggested anchors:

| Tier | Anchor price | Target buyer |
|------|-------------|--------------|
| Starter | EUR 499/mo | Smaller wind operators, ISP contractors with <5 open roles |
| Growth (decoy) | EUR 999/mo | Mid-size OEMs, regional service companies |
| Featured Partner | EUR 1999/mo | Vestas-class OEMs, large ISPs, O&M groups |

Pricing exact numbers remain a planning-phase decision (per PROJECT.md). Feature breakdown below is what populates these tiers.

---

## Table Stakes

Features candidates and employers expect. Their absence makes the product feel broken or amateurish. Free-tier or platform-baseline; no employer pays for these specifically but they cannot be missing.

| Feature | Why expected | Complexity | Notes for OwlJobs |
|---------|-------------|------------|-------------------|
| Job listings with apply link | Core function | Low | Already exists; apply routes to employer ATS (per PROJECT decisions) |
| Search + filter (location, role, level) | Universal pattern | Low | Wind-specific: certifications (GWO, BTT, Sea Survival), onshore/offshore, OEM platform |
| Auto-generated company profile pages | Indeed/LinkedIn baseline; SEO surface | Low | Already in Phase 4. Stub from ingest data (name, logo, open roles, location). MUST exist for free tier or "claim" CTA has nowhere to land |
| Job alert email subscription (candidate) | Job seekers expect this from any board | Medium | Phase 3 daily digest covers this |
| JSON-LD structured data (JobPosting) | Google for Jobs visibility, SEO | Low | Phase 3 already plans this |
| Mobile-responsive listing pages | Universal | Low | Astro SSR already responsive |
| GDPR compliance (consent, unsubscribe, deletion) | Legal in EU | Medium | Phase 1 |
| Stale job removal | Trust-killer if missing (per PROJECT context) | Medium | Phase 1 |
| Logo on free company profiles | Indeed/Glassdoor baseline | Low | Pull from clearbit/logo.dev or scrape from employer career site during enrich |
| RSS / Atom feed of jobs | Aggregators and power users syndicate from this | Low | Already exists |

---

## Differentiating Features (Paid Tier)

Features that justify the EUR 500-2000/mo price. Drawn from Dice, RemoteOK, WeWorkRemotely, Stack Overflow Talent (pre-shutdown), Handshake, and association job boards.

### Tier 1: Visibility Boost (Starter)

| Feature | Pattern source | Implementation note |
|---------|---------------|---------------------|
| **Featured/pinned listings** in search results | Indeed Sponsored (3.1x impressions vs free), Dice promoted post (+$99), RemoteOK sticky post | Add `is_featured: bool` and `featured_until: timestamp` to jobs table. Pin to top of niche listing pages above organic ingested jobs. Display "Featured Employer" badge |
| **Highlighted card** (color border, badge) | WeWorkRemotely "Better/Best", Indeed enhanced styling | CSS treatment; cheap to implement, visually obvious value |
| **Logo on listing card** (free tier shows generic) | RemoteOK, WeWorkRemotely | Free-tier card has no logo or grayed logo; paid tier shows full color logo on listing card |
| **Company description visible on listing card** | Standard pattern | Free shows just title + location; paid shows 1-2 sentence company tagline |
| **Priority in candidate email digest** | Implicit at most boards | Featured employer's matching jobs appear first (or in own section) in the daily digest emails |

### Tier 2: Brand Control (Growth)

| Feature | Pattern source | Implementation note |
|---------|---------------|---------------------|
| **Editable company profile page** | Stack Overflow Jobs (rich profiles linked to job ads), Handshake, Indeed Premium | Unlock CMS-like editing of: hero image, "About" rich text, benefits list, photo gallery, video embed, social links. Free tier shows ingested data only |
| **Custom call-to-action on company page** | Standard | "Apply now", "Talk to recruiter", "Join talent pool" buttons configurable |
| **Up to 5 custom outbound links** (career site, LinkedIn, blog) | Recruitics employer branding best practices | Simple form fields |
| **Employee testimonials / "Meet the team" section** | Recruitics, Hireology | Just rich-text + image upload; no fancy infrastructure |
| **Benefits & perks list** (structured) | Universal employer brand pattern | Checkbox set + free-text. Renders icons on profile page |
| **Company news / updates feed** | Recruitics, Beetween | Optional; treat as v2 inside this tier |
| **Featured slot on niche homepage** ("Featured Employers" carousel) | Most niche boards | Limited slots (e.g. 3-6) creates scarcity |

### Tier 3: Audience Reach (Featured Partner)

| Feature | Pattern source | Implementation note |
|---------|---------------|---------------------|
| **Candidate match alert emails** to employer when new matching subscriber arrives | Indeed Smart Sourcing alerts, Dice TalentSearch | Unique-ish for niche boards; cheap if you already have classification + subscriber matching. Email employer: "5 new GWO-certified candidates joined this week matching your roles" |
| **Talent pool / candidate database access** | Dice, Stack Overflow Talent (historically), specialized boards at $1000+/seat | High effort + GDPR-heavy. **Defer to v2.** Replace with curated weekly candidate digest emailed to employer (no DB exposure, founder-curated) for v1 |
| **Premium company profile** with video, photo gallery, multi-section layout | RemoteOK company branding ad-on, Stack Overflow company pages | Build once, gate behind tier |
| **Sponsored placement on candidate digest emails** | Newsletter monetization standard | "This week's roundup brought to you by [Vestas]" header banner. One sponsor per niche per send |
| **Quarterly hiring report** (PDF: market activity, salary bands, candidate flow) | Custom-research style add-on, common at $500+ tiers | Founder-generated initially; differentiates and feeds upsell |
| **Account manager / direct Slack channel** | High-end SaaS standard at this price | Founder-led sales (per PROJECT decisions) covers this naturally for first 5 customers |

---

## Anti-Features (Do Not Build)

Things that look like features but actively damage product, violate Out-of-Scope, or burn build time without revenue lift.

| Anti-feature | Why avoid | What to do instead |
|-------------|-----------|--------------------|
| Direct apply / inbox / ATS | Per PROJECT: 6+ weeks complexity, doesn't unblock revenue | Apply links route to employer ATS |
| Candidate accounts, profiles, CV upload | Per PROJECT: email-only candidates | Email subscription + match alert is the candidate relationship |
| Self-serve employer Stripe checkout (v1) | Per PROJECT: founder-led sales for first 5 | Manual Stripe invoice + onboarding call |
| Pay-per-job-post pricing | Commoditizes; competes with Indeed on price (loss); contradicts subscription thesis | Subscription only. EUR 500-2000/mo flat |
| "Promote on social media" claims | Cannot deliver at scale; sets expectation that hurts retention | Skip from feature list |
| Generic resume database from scraped LinkedIn | GDPR catastrophe in EU. Reputation destroyer | Email-only subscriber list with explicit consent |
| Open employer self-serve profile claim without verification | Fraud and brand-impersonation risk | Verification flow (see "Claim flow" below) |
| Two-sided messaging / chat | Adds moderation, GDPR DPA, abuse vectors | Email handoff via apply link |
| Salary insights tool / market data dashboard | Requires data scale that doesn't exist yet | Defer; can become Premium tier add-on later |
| Real-time push notifications to candidates | App-store + service-worker complexity for marginal lift over email | Email digest only |
| Multilingual UI | Per PROJECT Out-of-Scope | English only |

---

## Featured Listing: What Actually Justifies Payment

The core question. Indeed's data point is the most useful: **sponsored jobs get 3.1x impressions and convert to 3.2x more applicants**. RemoteOK guarantees minimum 200 views per $600 listing (refunds via additional boost otherwise).

For OwlJobs, "featured" must include **at least three** of the following or it feels like a paint job:

1. **Pin to top** of relevant niche search results (above ingested organic jobs)
2. **Visual differentiation** (border + badge + logo prominence)
3. **Inclusion in candidate email digest** (and ideally a dedicated "Featured Roles" section at the top)
4. **Inclusion in homepage "Featured Employers"** carousel
5. **SEO-boosted slug** (e.g. own dedicated landing page, internal links from category pages)
6. **Performance metric exposure** in the employer dashboard (views, clicks, apply-clicks) so they see what they're paying for

The performance dashboard is what converts month 1 -> month 12. Without metrics, employers cannot justify the spend internally and churn.

---

## Company Profile Pages: Free vs Paid

Employers expect to control the story when they pay. Pattern from Recruitics, Monster, Hireology, Beetween:

### Free (auto-generated from ingest)

- Company name, headquarters location
- Logo (best-effort from logo.dev or scraped favicon)
- Auto-generated description (1-2 sentences from website meta or LinkedIn snippet)
- List of currently open roles in the niche
- "Claim this listing" CTA

### Paid (Growth and above)

- Hero image / cover photo (uploaded)
- Custom rich-text "About" (mission, values, culture)
- Benefits and perks (structured icon list + free text)
- 2-4 employee testimonial blocks (name, role, photo, quote)
- Photo gallery (3-12 images, e.g. site visits, training, equipment)
- Embedded video (YouTube/Vimeo)
- Up to 5 custom links (careers site, LinkedIn, social, blog)
- Custom "Apply" CTA configuration
- Featured roles list (pinned in their own listing)
- Hiring contact details (recruiter name, optional photo)

### Featured Partner (top tier)

- All of above
- Custom URL slug (`/companies/vestas` instead of `/companies/vestas-wind-systems-as`)
- Multi-section layout (about / culture / open roles / news)
- News / blog feed
- Statistics callouts ("12 turbines installed weekly", "3500 technicians worldwide")
- Schema.org Organization markup with full structured data

---

## Candidate Match Alert Emails (Employer-Facing)

Pattern lifted from Indeed Alerts and Dice Smart Sourcing. The technical pattern:

### Trigger

- New subscriber confirms email AND matches employer's role criteria (job titles, certs, location radius)
- OR: existing subscriber's profile updates (not applicable in OwlJobs v1; subscribers are email-only)

### Frequency

- **Real-time** (each match): Looks aggressive, leads to alert fatigue. Skip for v1.
- **Daily digest**: standard pattern (Indeed default). Right balance for hiring urgency.
- **Weekly roundup**: better for niche boards where new matching candidates trickle (5-20/week).

**Recommendation for OwlJobs**: weekly roundup at first. Wind tech audience is small (target 100-1000 subscribers initially). Daily digest would often be empty. Switch to daily once the candidate flow justifies it (>=5 matching subs/week per employer).

### Format

| Element | Content |
|---------|---------|
| Subject | "5 new wind turbine technicians matched your roles this week" |
| Header | Branded OwlJobs / Wind Turbine Jobs lockup |
| Body | Anonymized list: "Technician, GWO certified, 4 years offshore, Denmark, available for travel" |
| CTA | "Reply to be introduced" (founder-facilitated v1) OR "View full profile" (v2 once talent pool exists) |
| Footer | Subscription stats: "147 active candidates in your niche this week. Featured roles get 3.1x more views." (FOMO upsell) |

### Anti-pattern to avoid

- Sending **named candidate** info without explicit subscriber consent. GDPR violation. Use anonymized profiles unless subscriber opted-in to direct sharing.

---

## Claim Your Listing: Flow Design

Pattern from Handshake, Crunchbase, Glassdoor. The challenge: prevent impersonation while keeping friction low enough that real recruiters complete the flow.

### Recommended OwlJobs flow (v1, manual review)

1. **Trigger:** "Claim this company" CTA on auto-generated company profile page
2. **Form fields:**
   - Full name
   - Work email (must match company domain — primary verification signal)
   - Job title at company
   - Company website (pre-filled, editable)
3. **Email verification:** standard double-opt-in to the work email
4. **Identity check:**
   - Domain match between work email and registered company domain (auto-pass if matches)
   - If no domain match (free email like gmail) -> manual review queue (founder reviews; LinkedIn check)
5. **Approval:** Founder approves manually for v1. Sends Stripe invoice + onboarding call link
6. **Access provisioning:** On payment, account gets editor access to company profile + dashboard

### Why manual

- Founder-led sales model means every claim is also a sales conversation
- Verification automation (Handshake-style EIN lookup, Clearbit Reveal) is overkill for first 5 customers
- Manual review = 5-15 minutes per claim, fine at low volume

### v2 automation triggers

- More than 10 claims/week makes manual review a bottleneck
- Self-serve Stripe checkout introduced -> automated verification needed before access

---

## Email Alert Format Performance (Candidate-Facing)

Industry benchmarks (MailerLite, HubSpot, Campaign Monitor 2025):

- Industry-wide average open rate: 35-40%
- Niche audience open rates: 50%+ achievable with curated content (Morning Brew at 40%+ as exception, hobby/religious lists at 53-55%)
- Average CTR: 2.09%
- Niche B2B CTR: 1.5% considered excellent

For wind tech (small high-intent niche), targets:
- Open rate: aim 45%+
- CTR: aim 8%+ (high intent, narrow audience, jobs are inherently action-oriented)

### Format recommendations

| Format | When to use | Pattern |
|--------|------------|---------|
| **Daily digest** | Once subscriber count > ~500 AND new-job rate > 5/day | "5 new wind turbine technician roles today". Send 7-9am local time |
| **Weekly roundup** | Default for first 6-12 months | Tuesday or Thursday, 9am. "This week in wind: 23 new openings". Mix featured roles + organic |
| **Real-time match alert** | Premium tier candidate option | Single matching role alert, opt-in only, throttled to max 1/day |
| **Monthly market report** | Differentiator content | "State of the wind tech job market: October". Salary bands, hottest skills, employer activity |

Daily emails get unsubscribes if content is thin. Weekly is safer until job velocity supports daily. **Start weekly per Phase 3 plan; upgrade to daily when subscriber feedback or open rates flag the need.**

---

## Minimum Viable Employer Dashboard (First Revenue)

Per PROJECT, founder-led sales for first 5 customers. The dashboard must do **just enough** that an employer paying EUR 500+/month feels they have control. Not a full-featured admin panel.

### MVP scope (Phase 5)

| Page | Purpose | Required |
|------|---------|----------|
| Login | Magic-link to work email (no passwords) | Yes |
| Account | Company name, billing email, plan tier, "Manage subscription" button (Stripe customer portal link) | Yes |
| Company profile editor | Edit fields listed in Paid section above (hero, about, benefits, links, testimonials) | Yes |
| Open roles | List of currently-ingested jobs from this company. Toggle "Feature this job" (writes `is_featured`) per job. Show featured-slot quota for tier | Yes |
| Performance | Last-30-days views per job (from CF Pages analytics or simple counter), email-digest impressions, apply-button clicks | Yes — without this, employers cannot justify renewal |
| Candidate alerts | Settings: alert frequency (off/weekly/daily), role criteria, recipient emails | Yes (top tier only) |

### Cuttable from MVP

- User invitations / multi-user accounts (single login per company is fine for first 5)
- Audit logs
- Custom branded analytics export (CSV download is enough)
- API access
- Job posting form (jobs are ingested, not posted; employer doesn't need a "create job" button initially. If they need to add a role not on their ATS, they can email founder)
- Granular RBAC

### Tech alignment

- Cloudflare Pages SSR (Astro) for the dashboard pages — same stack as candidate-facing site
- Supabase auth with magic-link (no password infra)
- Stripe customer portal handles all billing UI (no need to build subscription management)

### Build order for first revenue

1. Magic-link login + simple authenticated route in Astro
2. Company profile editor (the visible "what you're paying for")
3. "Feature this job" toggle (the upsell anchor)
4. Performance counters (the renewal anchor)
5. Candidate alerts settings (top-tier only; defer if no top-tier customer yet)

---

## Feature Dependencies

```
Auto-generated company profiles  -->  "Claim" CTA  -->  Verification flow  -->  Editable profile
                                                                                    |
Subscriber base (>=100)  ----->  Candidate match alerts  -->  Featured digest slots
                          |
                          +---->  Daily/weekly candidate digest  -->  Sponsored newsletter slots

Featured listing toggle  -->  Pin in search results
                         -->  Pin in candidate digest
                         -->  Pin on homepage carousel
                         -->  Performance counters in dashboard

Stripe customer portal  -->  Subscription mgmt UI (no build needed)

Magic-link auth  -->  Dashboard  -->  All employer-side editing & metrics
```

Critical path to first revenue (Phase 4 + 5 of PROJECT):
**Profile pages -> Claim flow -> Manual verification -> Manual Stripe invoice -> Magic-link dashboard -> Profile editor -> Featured toggle.**

---

## MVP Recommendation (Tier Composition for First 5 Sales)

For founder-led first revenue, structure tiers so the **EUR 999 Growth tier** is the easy default upsell from Starter, with Featured Partner as visible aspiration.

### Starter (EUR 499/mo)

- Up to 3 featured/pinned roles at any time
- Logo + tagline on listing cards
- Branded company profile (auto-generated, employer can correct factual errors)
- Performance dashboard (views, clicks, apply-clicks)
- Monthly summary email

### Growth (EUR 999/mo) — DECOY / TARGET

- Everything in Starter
- Up to 10 featured roles
- Fully editable rich company profile (hero, about, benefits, testimonials, gallery, video, custom links)
- Featured slot rotation in homepage carousel
- Weekly candidate match alert email
- Quarterly market snapshot (1-pager)

### Featured Partner (EUR 1999/mo)

- Everything in Growth
- Unlimited featured roles
- Top placement in candidate email digests + dedicated featured section
- Sponsored newsletter slot once per quarter
- Custom company profile URL slug + multi-section layout
- Monthly hiring report (PDF, founder-curated)
- Direct founder Slack/email channel
- First-look at new niche launches

### Defer to post-revenue

- Talent pool database access (GDPR-heavy, requires consent flows from candidates)
- Self-serve Stripe checkout
- Multi-user accounts
- API access
- Job posting form for non-ATS roles
- Real-time candidate alerts

---

## Key Findings Summary

1. **3-tier ladder is industry standard** (Dice, RemoteOK, WeWorkRemotely all use it). Decoy middle tier converts customers to top tier. Anchor: EUR 499 / 999 / 1999.

2. **Featured listing must bundle at least 3 of: pin, visual badge, digest inclusion, homepage carousel, performance metrics.** Single-mechanism "featured" feels like paint.

3. **Performance dashboard is the renewal hinge.** Indeed's 3.1x-impressions data is the proof employers need to justify spend. Build view/click/apply counters from day one, not "later."

4. **Editable company profile is the visible justification for tier upgrade** from Starter to Growth. Free tier auto-generated; paid tier full control. Pattern from Stack Overflow Jobs (rich profiles linked to ads) and Recruitics employer-branding best practices.

5. **Weekly candidate digest beats daily for v1** at small audience scale. Wind tech audience too small for compelling daily content. Switch to daily once 5+ matching candidates per week per employer.

6. **Claim flow can stay manual** for first 5 customers. Domain-match auto-verify, founder reviews edge cases, manual Stripe invoice. Automate only when claim volume > 10/week.

7. **Talent pool database is a v2 feature, not v1.** GDPR overhead is large. Replace with founder-curated weekly candidate digest emailed to employer.

8. **Anti-features matter as much as features.** Direct apply, candidate accounts, self-serve checkout, social-media-promotion claims, scraped LinkedIn data — each is an Indeed/LinkedIn fight OwlJobs cannot win. Stay narrow.

---

## Sources

- [10 Ways to Monetize Your Niche Job Board in 2025 - Job Boardly](https://www.jobboardly.com/blog/10-ways-to-monetize-your-niche-job-board-in-2025)
- [5 Job Board Pricing Models Compared - Job Boardly](https://www.jobboardly.com/blog/5-job-board-pricing-models-compared)
- [Job Board Pricing Models - Cavuno](https://cavuno.com/blog/job-board-pricing-models)
- [4 Different Pricing Models for Job Boards - Niceboard](https://niceboard.co/learn/monetizing/4-different-revenue-models-for-job-boards)
- [Top Job Board Features Employers Look For - Job Boardly](https://www.jobboardly.com/blog/top-job-board-features-employers-look-for)
- [Free vs Sponsored Jobs on Indeed](https://www.indeed.com/hire/resources/howtohub/free-vs-sponsored-jobs-on-indeed)
- [Indeed Pricing: How Paid Job Posts Work](https://www.indeed.com/hire/resources/howtohub/how-pricing-works-on-indeed)
- [How to Never Miss a Quality Candidate with Indeed Alerts](https://www.indeed.com/hire/resources/howtohub/indeed-alerts)
- [Dice Pricing - Packages and Subscription Costs for Employers](https://www.dice.com/hiring/pricing)
- [Dice.com Reviews 2025 - Flexiple](https://flexiple.com/reviews/dice)
- [WeWorkRemotely FAQ](https://weworkremotely.com/frequently-asked-questions)
- [WeWorkRemotely Review - Worktugal](https://worktugal.com/weworkremotely-review/)
- [Hire Remotely - RemoteOK](https://remoteok.com/hire-remotely)
- [Stack Overflow Jobs Shutdown Coverage - ToTalent](https://totalent.eu/stack-overflow-exits-the-talent-acquisition-sphere-announces-plans-to-discontinue-jobs/)
- [End of the Line for Stack Overflow Jobs - i-programmer](https://www.i-programmer.info/news/99-professional/15185-end-of-the-line-for-stack-overflow-jobs.html)
- [Employer Validation - Handshake Help Center](https://support.joinhandshake.com/hc/en-us/articles/8083511439127-Employer-Validation)
- [Employer Branding Best Practices for Company Profiles - Recruitics](https://info.recruitics.com/blog/employer-branding-best-practices-company-profiles)
- [Using a Careers Page to Build Your Employer Brand - Hireology](https://hireology.com/hiring-101/using-a-careers-page-to-build-your-employer-brand/)
- [Email Marketing Benchmarks 2025 - MailerLite](https://www.mailerlite.com/blog/compare-your-email-performance-metrics-industry-benchmarks)
- [Email Click-Through Rate Benchmarks - beehiiv](https://www.beehiiv.com/blog/email-click-through-rate-benchmarks)
- [Email Marketing Benchmarks by Industry - HubSpot](https://blog.hubspot.com/sales/average-email-open-rate-benchmark)
- [How to Use Job Alerts for Niche Job Boards - Job Boardly](https://www.jobboardly.com/blog/how-to-use-job-alerts-for-niche-job-boards)
- [Earn More Revenue from Your Niche Job Board - YMCareers](https://www.ymcareers.com/blog/non-dues-revenue-niche-job-board/)
- [GWO Whitepaper on Job Roles for Wind Technicians](https://www.globalwindsafety.org/news/gwo-whitepaper-on-job-roles-paves-way-for-careers-in-wind)
- [Rigg Access - Wind/GWO Job Network](https://www.rigg-access.com/jobs/new-jobs)
