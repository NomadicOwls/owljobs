-- Adds:
--   wind_turbine.jobs.status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired'))
--   wind_turbine.jobs.expired_at  TIMESTAMPTZ                    (soft-delete detection time)
--   wind_turbine.subscribers.consent_given_at TIMESTAMPTZ        (GDPR Art 7 consent timestamp)
--
-- IMPORTANT: jobs.expired_at (this migration) and jobs.expires_at (0001_initial.sql) are
-- DIFFERENT columns. expires_at = employer-stated closing date (kept as-is).
-- expired_at = OUR soft-delete detection timestamp set when an ATS feed stops returning the job.
--
-- Replace every occurrence of «wind_turbine» with the niche schema name before running
-- (or use pnpm niche:provision <id> which substitutes for you).
--
-- Apply via Supabase SQL editor AFTER 0001_initial.sql + 0002_rls.sql + 0003_subscribers_multi_niche.sql.

-- 1. Stale-job lifecycle on jobs (per CONTEXT D-02, D-03)
ALTER TABLE wind_turbine.jobs
  ADD COLUMN status     TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'expired')),
  ADD COLUMN expired_at TIMESTAMPTZ;

-- Index for fast cleanup of expired rows past 90-day retention (per CONTEXT D-06)
CREATE INDEX idx_jobs_expired_at_cleanup
  ON wind_turbine.jobs(expired_at)
  WHERE status = 'expired';

-- Index for fast filtering of active rows in listing/feed/sitemap queries
CREATE INDEX idx_jobs_status_active
  ON wind_turbine.jobs(status, posted_at DESC)
  WHERE status = 'active';

-- 2. GDPR consent timestamp on subscribers (per CONTEXT D-12)
ALTER TABLE wind_turbine.subscribers
  ADD COLUMN consent_given_at TIMESTAMPTZ;

-- Backfill existing subscribers — they consented under prior wording; record their
-- original signup as the consent moment so the column is never NULL post-migration
-- (low row count, pre-prod — see RESEARCH.md Assumption A4).
UPDATE wind_turbine.subscribers
   SET consent_given_at = created_at
 WHERE consent_given_at IS NULL;

-- 3. Update the existing public_relevant_jobs RLS policy (from 0002_rls.sql) to exclude
-- expired rows. Anonymous reads must NEVER return status='expired'.
DROP POLICY IF EXISTS public_relevant_jobs ON wind_turbine.jobs;
CREATE POLICY public_relevant_jobs ON wind_turbine.jobs FOR SELECT TO anon
  USING (
    status = 'active'
    AND (
      classification_score >= 0.6
      OR (is_sponsored AND (featured_until IS NULL OR featured_until > now()))
    )
  );
