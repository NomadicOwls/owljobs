-- OwlJobs Phase 4 — Employer RLS
-- Paste into Supabase SQL Editor.
-- Replace every occurrence of «wind_turbine» with your niche's schema name before running.
-- The provision script (pnpm niche:provision <id>) generates a pre-substituted copy.
--
-- Prerequisite: migration 0007 applied AND jwt-path-verification.md completed.
-- JWT employer_id path: auth.jwt()->'app_metadata'->>'employer_id'

-- ─── public.employer_users ────────────────────────────────────────────────────
ALTER TABLE public.employer_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employer_users_self_read ON public.employer_users;
CREATE POLICY employer_users_self_read
  ON public.employer_users
  FOR SELECT
  TO authenticated
  USING (auth_id = auth.uid());

-- ─── wind_turbine.employers (public profile pages) ────────────────────────────
-- NOTE: RLS already enabled in migration 0002; public_employers policy covers anon.
-- This migration adds an `authenticated` read for logged-in employers (mirrors anon view).
DROP POLICY IF EXISTS employers_auth_read ON wind_turbine.employers;
CREATE POLICY employers_auth_read
  ON wind_turbine.employers
  FOR SELECT
  TO authenticated
  USING (TRUE);

-- NOTE: employer profile UPDATE policy is intentionally NOT created here.
-- Profile editing is locked in Phase 4 (D-06) and writes go through supabaseAdmin
-- (service_role bypasses RLS). Phase 5 will add an UPDATE policy gated on
-- subscription_active = true AND tier IN ('starter','growth','partner').

-- ─── wind_turbine.jobs (employer dashboard reads + featured toggle) ────────────
-- NOTE: RLS already enabled in migration 0002; public_relevant_jobs covers anon.
-- This migration adds:
--   1. authenticated read mirroring the anon policy (defence-in-depth for logged-in /jobs)
--   2. employer read of own jobs (including drafts/expired) for the dashboard
--   3. employer UPDATE of own jobs (featured_until toggle — FEAT-03)

DROP POLICY IF EXISTS jobs_auth_read_public ON wind_turbine.jobs;
CREATE POLICY jobs_auth_read_public
  ON wind_turbine.jobs
  FOR SELECT
  TO authenticated
  USING (
    classification_score >= 0.6
    OR (is_sponsored AND (featured_until IS NULL OR featured_until > now()))
  );

DROP POLICY IF EXISTS jobs_employer_read_own ON wind_turbine.jobs;
CREATE POLICY jobs_employer_read_own
  ON wind_turbine.jobs
  FOR SELECT
  TO authenticated
  USING (employer_id = (auth.jwt()->'app_metadata'->>'employer_id'));

DROP POLICY IF EXISTS jobs_employer_update_own ON wind_turbine.jobs;
CREATE POLICY jobs_employer_update_own
  ON wind_turbine.jobs
  FOR UPDATE
  TO authenticated
  USING (employer_id = (auth.jwt()->'app_metadata'->>'employer_id'))
  WITH CHECK (employer_id = (auth.jwt()->'app_metadata'->>'employer_id'));

-- service_role bypasses RLS by default; no policy needed for ingest worker,
-- claim API, or featured toggle API — all use supabaseAdmin() with service key.

-- ─── Phase 5 deferred policies (DO NOT ENABLE YET) ───────────────────────────
-- employers_update_own: UPDATE TO authenticated WHERE subscription_active = true
--   AND employer_id = (auth.jwt()->'app_metadata'->>'employer_id')
-- employer_users_insert_self: INSERT TO authenticated for claim flow (Phase 5)
