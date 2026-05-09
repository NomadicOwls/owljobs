# Phase 1 Deployment Runbook

**Phase:** 01-production-foundation
**Audience:** Operator (founder or future maintainer)
**Order:** Steps are sequential — earlier steps gate later ones.

---

## 0. Prerequisites

- [ ] Wrangler CLI ≥ 3.x logged in: `wrangler whoami` returns the OwlJobs account email
- [ ] Plans 01–04 are merged to `main` and the working tree is clean
- [ ] You have access to: Supabase Dashboard, Resend Dashboard, Cloudflare Dashboard, Google Cloud Console, Google Search Console

---

## 1. Apply Supabase migrations [BLOCKING — gates everything else]

> No Supabase migration CLI is wired in this project. Canonical procedure is paste-into-SQL-editor.

For each migration, in order:

1. Open Supabase Dashboard → **SQL Editor** → New query
2. Paste the file contents (substituting `«wind_turbine»` placeholder if your niche uses a different schema name — for niche 1 leave as `wind_turbine`)
3. Run; verify no errors

**Migrations to apply (in order):**

- [ ] `packages/schema/src/migrations/0002_rls.sql` — adds RLS policies (skip if already applied; check `SELECT * FROM pg_policies WHERE schemaname = 'wind_turbine';` first)
- [ ] `packages/schema/src/migrations/0003_subscribers_multi_niche.sql` — adds niche column + confirmation_token (skip if `SELECT niche FROM wind_turbine.subscribers LIMIT 1;` succeeds)
- [ ] **[BLOCKING] Apply migration 0004**: `packages/schema/src/migrations/0004_stale_jobs_consent.sql`
  - Verify with: `SELECT column_name FROM information_schema.columns WHERE table_schema = 'wind_turbine' AND table_name = 'jobs' AND column_name IN ('status', 'expired_at');` → must return both rows
  - And: `SELECT column_name FROM information_schema.columns WHERE table_schema = 'wind_turbine' AND table_name = 'subscribers' AND column_name = 'consent_given_at';` → must return one row
  - And: `SELECT polname FROM pg_policies WHERE schemaname = 'wind_turbine' AND tablename = 'jobs' AND polname = 'public_relevant_jobs';` → must return one row (RLS replaced)

⚠ Do NOT proceed to step 2 until migration 0004 is verified live. The Plan 01 / Plan 02 / Plan 03 code paths assume the column exists.

---

## 2. Resend domain verification

1. Resend Dashboard → **Domains** → **Add Domain** → `windturbinejobs.com`
2. Resend will display SPF / DKIM (multiple) / DMARC records as TXT records
3. Cloudflare Dashboard → `windturbinejobs.com` → **DNS** → **Records** → for each Resend record:
   - **Type**: TXT
   - **Name**: as shown by Resend (e.g. `resend._domainkey`, `_dmarc`, `@`)
   - **Content**: as shown by Resend (paste verbatim — no quotes added)
   - **Proxy status**: DNS only (grey cloud)
4. After all records are added, return to Resend Dashboard → click **Verify DNS Records**
5. Wait until status reads **Verified** for SPF, DKIM, and DMARC. (Up to 72h propagation; usually under 30 min.)

Verification:
```bash
dig TXT windturbinejobs.com +short                           # MUST contain v=spf1 ... include:_spf.resend.com ...
dig TXT resend._domainkey.windturbinejobs.com +short          # MUST contain v=DKIM1; ...
dig TXT _dmarc.windturbinejobs.com +short                    # MUST contain v=DMARC1; ...
```

---

## 3. Set Cloudflare Pages secrets (6 total)

⚠ Per RESEARCH.md Pitfall 2: 6 Pages secrets, NOT 7. CONTEXT.md mistakenly lists `GOOGLE_INDEXING_KEY` as a Pages secret — it is a **Worker** secret (step 4).

Run from the repo root:

```bash
# All 6 commands target the owljobs Pages project. Replace <PROJECT_NAME> if different.
wrangler pages secret put SUPABASE_URL          --project-name owljobs
wrangler pages secret put SUPABASE_ANON_KEY     --project-name owljobs
wrangler pages secret put SUPABASE_SERVICE_KEY  --project-name owljobs
wrangler pages secret put RESEND_API_KEY        --project-name owljobs
wrangler pages secret put TURNSTILE_SECRET_KEY  --project-name owljobs
wrangler pages secret put TURNSTILE_SITE_KEY    --project-name owljobs
```

Verify (should list exactly these 6 names):
```bash
wrangler pages secret list --project-name owljobs
```

---

## 4. Set Worker secrets on owljobs-ingest (3 total)

```bash
cd workers/ingest
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_KEY
# GOOGLE_INDEXING_KEY value comes from step 5 below — set after the GCP service account is created
```

Verify:
```bash
wrangler secret list --name owljobs-ingest
```

---

## 5. Google Cloud — Indexing API setup

1. Open Google Cloud Console → choose or create project (e.g. `owljobs-niche-1`)
2. **APIs & Services** → **Library** → search "Indexing API" → **Enable**
3. **IAM & Admin** → **Service Accounts** → **Create service account**
   - Name: `indexing-bot`
   - Role: **Indexing API → Indexing API Publisher** (`roles/indexing.publisher`)
4. On the new service account → **Keys** → **Add Key** → **Create new key** → JSON → download
5. Copy the entire JSON file contents to clipboard
6. Set as Worker secret:
   ```bash
   cd workers/ingest
   wrangler secret put GOOGLE_INDEXING_KEY
   # paste the entire JSON when prompted
   ```
7. **Google Search Console** → `windturbinejobs.com` property → **Settings** → **Users and permissions** → **Add user** → paste the service-account email (e.g. `indexing-bot@owljobs-niche-1.iam.gserviceaccount.com`) with **Owner** permission

8. **JobPosting allow-list (RESEARCH Pitfall 4)** — submit the Indexing API form: https://docs.google.com/forms/d/e/1FAIpQLSfPPaTmvCYlmjZyRSAlEC-z5tEEPCNFZ59CQjXOLKaLYqIK7w/viewform
   - Without approval, pings will return 200 OK but Google ignores them. The Phase 1 code ships regardless; effectiveness is gated on this approval landing.

---

## 6. Mailbox: privacy@windturbinejobs.com

1. Cloudflare Dashboard → `windturbinejobs.com` → **Email Routing** → **Get Started**
2. Add MX records (Cloudflare auto-adds; click **Add and enable**)
3. Add a forwarder: `privacy@windturbinejobs.com → <founder-personal-email>`
4. Verify the destination (founder clicks the verification link Cloudflare sends to the personal address)

Smoke test:
```bash
# Send a test email TO privacy@windturbinejobs.com from any external address
# It should land in the founder's personal inbox within seconds
```

---

## 7. Deploy frontend + worker

```bash
# Frontend (Astro → Cloudflare Pages)
pnpm --filter @owljobs/web build
pnpm wrangler pages deploy apps/web/dist --project-name owljobs

# Worker (ingest)
cd workers/ingest
pnpm deploy   # or: pnpm wrangler deploy
```

---

## 8. Production smoke checklist

- [ ] `curl -sI https://windturbinejobs.com/` → 200 OK
- [ ] `curl -s https://windturbinejobs.com/privacy | grep -c "Request data deletion"` → ≥1 (deletion form rendered)
- [ ] `curl -s https://windturbinejobs.com/privacy | grep -c "Sub-processors"` → ≥1 (existing INFRA-05 preserved)
- [ ] `curl -sI https://windturbinejobs.com/sitemap.xml` → 200 OK
- [ ] Subscribe form on `/` — submit a real email WITHOUT ticking consent → inline error shown, no email sent
- [ ] Subscribe form on `/` — tick consent + submit → confirmation email arrives, sender is `noreply@windturbinejobs.com`, headers contain `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
- [ ] Click the confirmation link → row in `wind_turbine.subscribers` has `confirmed_at` non-NULL AND `consent_given_at` non-NULL
- [ ] Manually trigger ingest cron: `curl -s "https://owljobs-ingest.<account>.workers.dev/ingest-now" | jq` → see `expired`, `pinged`, `pingFailures` in stats
- [ ] After cron run, find an expired job from worker logs: `curl -sI https://windturbinejobs.com/jobs/<expired-slug>` → `HTTP/2 410` + `Cache-Control: public, s-maxage=300`
- [ ] Privacy page deletion form — submit valid email + Turnstile → success message; founder's mailbox receives the GDPR notification email

---

## 9. Open issue to track post-Phase-1

- [ ] **JobPosting Indexing API approval status** — track via Search Console for the next 7 days. If approval doesn't land, flag DATA-03 effectiveness as deferred even though code ships green.
