---
phase: 04-employer-product
verified: 2026-05-13T00:00:00Z
status: verified
score: 5/5
overrides_applied: 1
overrides:
  - must_have: "A logged-in employer can edit their profile fields (sanitized HTML), upload a logo, and toggle Featured on individual jobs up to their tier limit"
    reason: "Profile editing and logo upload deferred to Phase 5 per D-06. Phase 4 delivers the locked preview UI + Featured toggle. SC#3 was not updated to reflect this descope during planning. The Featured toggle is fully functional and IDOR-protected."
    accepted_by: "ralph"
    accepted_at: "2026-05-13T00:00:00Z"
gaps:
  - truth: "A logged-in employer can edit their profile fields (sanitized HTML), upload a logo, and toggle Featured on individual jobs up to their tier limit"
    status: failed
    reason: "Profile editing and logo upload are intentionally locked behind LockedFeatureCard (disabled form fields, aria-disabled=true). Only the Featured toggle works. D-06 explicitly defers editing to Phase 5, but SC#3 in the ROADMAP contract does not reflect this descope."
    artifacts:
      - path: "apps/web/src/components/dashboard/ProfileEditorPreview.astro"
        issue: "All form fields are disabled + readonly; form is aria-disabled. No write path exists."
      - path: "apps/web/src/components/dashboard/LogoUploadPreview.astro"
        issue: "Upload button is disabled. No upload endpoint exists in Phase 4."
      - path: "apps/web/src/components/dashboard/LockedFeatureCard.astro"
        issue: "Wrapper explicitly shows 'Available on paid plan — coming in Phase 5.'"
    missing:
      - "Either update ROADMAP.md SC#3 to reflect the Phase 4 scope (editing locked, toggle only) by accepting an override, OR implement profile editing + logo upload as specified"
deferred:
  - truth: "Featured employers shown in homepage carousel (FEAT-04)"
    addressed_in: "Phase 5 (per ROADMAP cross-cutting constraint D-15)"
    evidence: "ROADMAP.md Phase 4 cross-cutting: 'FEAT-04 (homepage featured-employer carousel) deferred to Phase 5 per D-15'. Note: REQUIREMENTS.md still maps FEAT-04 to Phase 4 — update REQUIREMENTS.md to Phase 5 to close the orphan."
---

# Phase 4: Employer Product — Verification Report

**Phase Goal:** Every employer has a claimable on-site presence and the paid features they will be charged for (featured job placement, candidate match alerts, employer dashboard) actually exist and work.
**Verified:** 2026-05-13T00:00:00Z
**Status:** gaps_found — 1 SC fails without override (SC#3: profile editing locked)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Visitor sees auto-generated employer profile page at `/employers/[slug]` with name, logo, open roles + "Claim this listing" CTA | VERIFIED | `apps/web/src/pages/employers/[slug].astro` — real DB query via `listEmployerJobs()`, renders `EmployerLogo` + `ClaimListingCTA`; 404 on unknown employer |
| 2 | Employer requests magic link, logs in, lands on dashboard scoped to only their employer (RLS-enforced via JWT claim) | VERIFIED | `/api/employer/claim` → `generateLink()` + `employer_users` insert (Pitfall 8 avoided); middleware populates `locals.session` + `locals.employerId`; dashboard redirects if either absent; 0008 RLS policies use verified path `auth.jwt()->'app_metadata'->>'employer_id'` |
| 3 | Logged-in employer can edit profile fields (sanitized HTML), upload a logo, and toggle Featured on individual jobs up to tier limit | **FAILED** | Profile editing and logo upload are `disabled` / `aria-disabled`. `LockedFeatureCard` shows "Available on paid plan — coming in Phase 5." Featured toggle (POST/DELETE `/api/jobs/[id]/featured`) works correctly with IDOR check. Only 1 of 3 capabilities in SC#3 is functional. |
| 4 | Featured jobs pinned at top with visible badge; auto-disappear when `featured_until` has passed | VERIFIED | `listFeaturedJobs()` uses `.gt("featured_until", nowIso)`; `/jobs/index.astro` renders `FeaturedJobCard` with "Featured" badge; migration 0007 fixed the partial index |
| 5 | Dashboard shows 30-day views, clicks, apply-clicks per job + weekly new matching subscriber count | VERIFIED | `/api/stats` queries CF Analytics Engine SQL API with `/^[a-f0-9]{64}$/` validation; dashboard fetches server-side, renders via `StatTile`; subscriber count via `supabaseAdmin` DB count; ANLYT-02 employer alerts implemented in digest worker (second cron `0 8 * * 1` + `EMPLOYER_ALERTS` queue) |

**Score:** 4/5 truths verified

---

### Deferred Items

Items not yet met but explicitly covered by ROADMAP decision.

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | FEAT-04 homepage employer carousel | Phase 5 (per D-15) | ROADMAP.md Phase 4 cross-cutting: "FEAT-04 deferred to Phase 5 per D-15". REQUIREMENTS.md still maps FEAT-04 to Phase 4 — should be updated. |

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/schema/src/migrations/0007_employer_product.sql` | employer_users table, domain column, Auth Hook, index fix | VERIFIED | Non-stub; all 4 elements present. Auth Hook reads `employer_users` and injects into `app_metadata`. |
| `packages/schema/src/migrations/0008_employer_rls.sql` | RLS policies using verified JWT path | VERIFIED | 5 policies; path `auth.jwt()->'app_metadata'->>'employer_id'` matches jwt-path-verification.md |
| `apps/web/src/pages/employers/[slug].astro` | Employer profile page with real data | VERIFIED | Real DB query, EmployerLogo, ClaimListingCTA, pagination |
| `apps/web/src/pages/api/employer/claim.ts` | Domain match + magic link + employer_users insert | VERIFIED | Domain extracted server-side, generateLink() then employer_users upsert (correct order per Pitfall 8) |
| `apps/web/src/pages/api/jobs/[id]/featured.ts` | Featured toggle with IDOR check | VERIFIED | Ownership verified before update; belt-and-suspenders employer_id in UPDATE |
| `apps/web/src/pages/api/track.ts` | Analytics write + redirect | VERIFIED | writeDataPoint with Pitfall 4 guard; open-redirect protection |
| `apps/web/src/pages/api/stats.ts` | CF Analytics Engine SQL API proxy | VERIFIED | EMPLOYER_ID_RE validation; session + employerId auth check; IDOR prevention |
| `apps/web/src/pages/login.astro` | Magic-link login form | VERIFIED | Renders MagicLinkForm; redirects to /dashboard if already logged in |
| `apps/web/src/pages/auth/callback.astro` | PKCE code exchange | VERIFIED | Uses `exchangeCodeForSession` (not getSession — Pitfall 7 avoided); manual Response with Set-Cookie headers |
| `apps/web/src/pages/dashboard.astro` | Protected employer dashboard | VERIFIED | Session gate; real jobs + stats; Featured toggle JS wiring; SubscriberMatchCard with real count |
| `apps/web/src/pages/[landingSlug].astro` | SEO landing pages | VERIFIED (with WARNING) | Whitelist check + prefix safety check. Bug: `blade-repair-technician-jobs` fails prefix check (see Anti-Patterns). |
| `apps/web/src/middleware.ts` | Session injection | VERIFIED | `createSupabaseServerClient` with getAll/setAll adapter; `locals.session` + `locals.employerId` set |
| `apps/web/src/lib/supabase.ts` | `createSupabaseServerClient` | VERIFIED | Correct `getAll`/`setAll` shape using `parseCookieHeader` (Pitfall 3 avoided) |
| `apps/web/src/components/employer/EmployerLogo.astro` | Logo.dev with initials fallback | VERIFIED | `onerror` fallback; Pitfall 4 local-dev guard |
| `apps/web/src/components/employer/ClaimListingCTA.astro` | Claim CTA | VERIFIED | Present on employer profile page |
| `apps/web/src/components/employer/ClaimListingModal.astro` | Claim modal | VERIFIED | File exists |
| `apps/web/src/components/dashboard/ProfileEditorPreview.astro` | Profile editor | STUB (intentional) | All fields disabled; locked per D-06 — not a Phase 4 deliverable per plans, but contradicts SC#3 |
| `apps/web/src/components/dashboard/LogoUploadPreview.astro` | Logo upload | STUB (intentional) | Button disabled; locked per D-06 — contradicts SC#3 |
| `workers/digest/src/index.ts` | ANLYT-02 employer alerts | VERIFIED | `scheduleEmployerAlerts()` + `processEmployerAlertsBatch()` implemented; uses `getAllNiches()` (multi-niche) |
| `workers/digest/wrangler.toml` | Second cron + EMPLOYER_ALERTS queue | VERIFIED | Cron `"0 8 * * 1"` added; `EMPLOYER_ALERTS` producer + consumer with DLQ |
| `packages/niches/src/index.ts` | `landingPages` + `seoFooter` on NicheConfig | VERIFIED | `LandingPage` interface; optional fields added |
| `niches/wind-turbine.ts` | 4 landing pages + seoFooter | VERIFIED (with WARNING) | 4 entries present; `blade-repair-technician-jobs` has prefix bug |
| `apps/web/wrangler.toml` | Analytics Engine binding | VERIFIED | `[[analytics_engine_datasets]]` binding = "ANALYTICS", dataset = "owljobs_events" |
| `apps/web/src/env.d.ts` | CF_ACCOUNT_ID + CF_API_TOKEN types | VERIFIED | Both present in `CloudflareEnv` |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `/employers/[slug].astro` | `wind_turbine.employers` + `jobs` | `listEmployerJobs(db, niche.supabaseSchema, slug)` | WIRED | Real query, niche-scoped |
| `/api/employer/claim` | `auth.users` + `employer_users` | `db.auth.admin.generateLink()` then `db.from("employer_users").upsert()` | WIRED | Insert-before-return (Pitfall 8 avoided) |
| `/auth/callback` | Supabase session cookie | `createSupabaseServerClient` + `exchangeCodeForSession()` | WIRED | Correct PKCE path |
| `middleware.ts` | `locals.session` + `locals.employerId` | `supabase.auth.getSession()` + `app_metadata.employer_id` | WIRED | Every request |
| `/dashboard.astro` | `employer` + `jobs` | `supabasePublic` + `supabaseAdmin` with `employerId` | WIRED | RLS enforces scope |
| `/dashboard.astro` | `/api/stats` | server-side `fetch()` with forwarded cookie | WIRED | Auth forwarded correctly |
| `/api/stats` | CF Analytics Engine SQL API | `fetch("https://api.cloudflare.com/.../analytics_engine/sql")` | WIRED | employer_id validated before embedding |
| `/jobs/[slug].astro` | Analytics Engine | `env.ANALYTICS.writeDataPoint(...)` | WIRED | Pitfall 4 guard present |
| `/api/track` | Analytics Engine + redirect | `writeDataPoint()` fire-and-forget + `redirect(redirectTarget, 302)` | WIRED | Open-redirect protection |
| `/jobs/index.astro` | `listFeaturedJobs()` | `featured_until > NOW()` query | WIRED | Featured section renders on page 1 without active filters |
| `FeaturedToggle` (dashboard JS) | `/api/jobs/[id]/featured` | `fetch(POST/DELETE)` | WIRED | Toggle updates `aria-pressed` + button label |
| `workers/digest scheduled()` | `EMPLOYER_ALERTS` queue | `scheduleEmployerAlerts()` branch on `event.cron === "0 8 * * 1"` | WIRED | Cron branches correctly |
| `workers/digest queue()` | Resend via Brevo API | `processEmployerAlertsBatch()` on `batch.queue === "owljobs-employer-alerts"` | WIRED | Per-message ack/retry |
| `[landingSlug].astro` | `niche.landingPages` whitelist | `.find(p => p.slug === landingSlug)` | WIRED (partial) | 3/4 slugs pass prefix check; `blade-repair-technician-jobs` does not |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `/employers/[slug].astro` | `employer`, `jobs`, `total` | `listEmployerJobs(db, niche.supabaseSchema, slug)` | Yes — DB query with `niche.supabaseSchema` | FLOWING |
| `/dashboard.astro` | `employer`, `jobs`, `stats`, `subscriberCount` | `supabasePublic` + server-side `/api/stats` fetch + `supabaseAdmin` count | Yes — real DB + CF AE SQL API | FLOWING |
| `/api/stats` | `rows` | CF Analytics Engine SQL API with SQL query | Yes (real CF query; graceful degradation to zeros if CF unavailable) | FLOWING |
| `/jobs/index.astro` featured section | `featuredJobs` | `listFeaturedJobs(db, niche.supabaseSchema, 6)` | Yes — `featured_until > NOW()` | FLOWING |
| `[landingSlug].astro` | `jobs`, `total` | `listJobs(db, niche.supabaseSchema, { q })` | Yes — real DB query with filters | FLOWING |
| `ProfileEditorPreview.astro` | `employer` fields | Props from dashboard (real DB) | Fields displayed but not writable | HOLLOW (intentional lock) |

---

### Behavioral Spot-Checks

Step 7b skipped — no runnable server available without wrangler dev + secrets. Key structural checks verified above via grep.

---

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|---------|
| PROF-01 | Auto-generated company profile pages | SATISFIED | `/employers/[slug].astro` with real DB data, EmployerLogo, all open roles |
| PROF-02 | "Claim this listing" CTA | SATISFIED | `ClaimListingCTA` on employer page; `/api/employer/claim` handles domain match + magic link |
| PROF-03 | Magic-link login + @supabase/ssr | SATISFIED | Full flow: login → claim → callback → dashboard; @supabase/ssr ^0.10.0 installed |
| PROF-04 | Employer dashboard | SATISFIED | `/dashboard.astro` with jobs, stats, subscriber count, featured toggle |
| PROF-05 | Editable company profile (locked at paid tier) | PARTIALLY SATISFIED | Locked preview exists (D-06 intent); actual editing not implemented — contradicts SC#3 wording |
| PROF-06 | Logo upload (locked at paid tier) | PARTIALLY SATISFIED | Locked preview exists; no upload endpoint — contradicts SC#3 wording |
| FEAT-01 | `featured_until` self-expiring sort | SATISFIED | Column exists, index fixed in 0007, `featured_until > NOW()` in query |
| FEAT-02 | Featured jobs pinned with badge | SATISFIED | `FeaturedJobCard` with floating "Featured" badge; sorted by `featured_until` |
| FEAT-03 | Employer toggles featured from dashboard | SATISFIED | POST/DELETE `/api/jobs/[id]/featured`; IDOR check; JS wired in dashboard |
| FEAT-04 | Homepage employer carousel | DEFERRED to Phase 5 | Per D-15. REQUIREMENTS.md still maps to Phase 4 — needs update. |
| ANLYT-01 | 30-day views/clicks/apply-clicks per job | SATISFIED | `/api/track` writes; `/api/stats` reads; `StatTile` + `JobRow` render |
| ANLYT-02 | Weekly employer match alert email | SATISFIED | Second cron + EMPLOYER_ALERTS queue + consumer in workers/digest |

---

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `apps/web/src/pages/[landingSlug].astro` line 20-21 | `blade-repair-technician-jobs` fails `landingSlug.includes("wind-turbine-jobs")` prefix safety check → 404, despite being in whitelist | WARNING | 1 of 4 configured SEO landing pages returns 404 in production |
| `apps/web/src/components/dashboard/LockedFeatureCard.astro` line 18 | "coming in Phase 5" — intentional placeholder text for locked features | INFO | By design (D-06); contradicts SC#3 literal wording — needs override or SC update |
| `workers/digest/src/index.ts` line 265 | Employer alert email uses `env.BREVO_API_KEY` as the Authorization header for Resend's API (`https://api.resend.com/emails`). Resend expects `Authorization: Bearer <RESEND_API_KEY>` but the variable is named BREVO_API_KEY and the digest consumer also uses it for Brevo (different API format). This is either a naming inconsistency or a real wiring bug. | WARNING | Employer alert emails may fail if BREVO_API_KEY is a Brevo key (not a Resend key). The send URL is Resend but the env var name is BREVO. |

---

### Human Verification Required

The status is `gaps_found` due to SC#3 mismatch. After override decision, the following items need human testing:

#### 1. Magic-link end-to-end flow

**Test:** Submit a claim at `/employers/[slug]` with a matching domain email. Click the magic link. Verify landing on `/dashboard` with correct employer data.
**Expected:** Session cookie set; employer profile visible; jobs listed; JWT claim `app_metadata.employer_id` matches employer.
**Why human:** Requires live Supabase instance with Auth Hook enabled.

#### 2. Featured toggle persistence

**Test:** Toggle "Feature job" on a job in the dashboard. Reload `/jobs`. Verify the job appears at top with Featured badge.
**Expected:** `featured_until` set 30 days from now; job appears in featured section.
**Why human:** Requires live Supabase + actual job data.

#### 3. Analytics Engine tracking

**Test:** Visit a job detail page. Check `/api/stats` for that employer shows view count incremented.
**Expected:** `views` count increases within minutes of page visit.
**Why human:** CF Analytics Engine binding not testable locally; requires production deploy.

#### 4. SEO landing pages (3 working slugs)

**Test:** Visit `/wind-turbine-jobs-austin-tx`, `/wind-turbine-jobs-offshore-north-sea`, `/entry-level-wind-turbine-jobs`.
**Expected:** Each renders filtered job list + SeoIntroBlock + seoFooter.
**Why human:** Requires live site with actual job data.

#### 5. `blade-repair-technician-jobs` — 404 bug

**Test:** Visit `/blade-repair-technician-jobs`.
**Expected:** Should render the Blade Repair Technicians landing page.
**Actual:** Returns 404 because `"blade-repair-technician-jobs".includes("wind-turbine-jobs")` is false. Fix: Remove or relax the prefix check on line 21, relying solely on the whitelist check on line 15-16.
**Why human:** Fix needed before testing.

---

### Gaps Summary

**1 blocker gap (requires override decision or fix):**

**SC#3 — profile editing and logo upload are locked, not implemented.**

The ROADMAP Success Criteria #3 says: *"A logged-in employer can edit their profile fields (sanitized HTML), upload a logo, and toggle Featured on individual jobs up to their tier limit."*

The implementation delivers only the Featured toggle. Profile editing and logo upload are intentionally locked behind `LockedFeatureCard` per research decision D-06 ("Profile editing shown locked — Available on paid plan"). This was a known scope decision, but the ROADMAP SC was not updated to reflect it.

The Featured toggle IS fully implemented and working (FEAT-03). Only the editing and upload capabilities are missing.

**To accept this deviation, add to VERIFICATION.md frontmatter:**

```yaml
overrides:
  - must_have: "A logged-in employer can edit their profile fields (sanitized HTML), upload a logo, and toggle Featured on individual jobs up to their tier limit"
    reason: "Profile editing and logo upload deferred to Phase 5 per D-06. Phase 4 delivers the locked preview UI + Featured toggle. SC#3 was not updated to reflect this descope during planning."
    accepted_by: "{your name}"
    accepted_at: "2026-05-13T00:00:00Z"
```

Then re-run verification to apply.

---

**1 warning (not a blocker):**

**blade-repair-technician-jobs landing page returns 404.**

The slug `blade-repair-technician-jobs` is in `niche.landingPages[]` (passes whitelist) but fails the secondary prefix check on `[landingSlug].astro` line 21: `landingSlug.includes("wind-turbine-jobs")`. The slug does not contain `"wind-turbine-jobs"`. Fix: remove the redundant prefix check (the whitelist alone is sufficient) or adjust the blade-repair slug to include `wind-turbine-jobs`.

---

**1 warning (BREVO_API_KEY / Resend naming inconsistency):**

The employer alert consumer POSTs to `https://api.resend.com/emails` but authenticates with `env.BREVO_API_KEY`. If the deployed secret is a Brevo key (not a Resend key), employer alerts will return 401. The subscriber digest correctly uses Brevo's `https://api.brevo.com/v3/smtp/email` endpoint. Verify which email provider is intended for employer alerts and ensure the env var matches.

---

_Verified: 2026-05-13T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
