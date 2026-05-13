-- OwlJobs Phase 4 — Employer Product
-- Paste into Supabase SQL Editor.
-- Replace every occurrence of «wind_turbine» with your niche's schema name before running.
-- The provision script (pnpm niche:provision <id>) generates a pre-substituted copy.
--
-- This migration ships schema + Auth Hook ONLY. RLS policies ship in 0008_employer_rls.sql
-- after the live JWT-path verification (plan 06, Critical Finding 4).

-- 1. Add domain column to employers (per-niche)
ALTER TABLE wind_turbine.employers
  ADD COLUMN IF NOT EXISTS domain TEXT;

-- 2. employer_users join table (public schema — global auth, not per-niche)
--    auth_id is nullable because at claim time the user has not yet authenticated.
--    The /api/employer/claim handler inserts the row immediately after generateLink()
--    returns user.id (Pitfall 8). Existing row is upserted on (employer_id, niche_id).
CREATE TABLE IF NOT EXISTS public.employer_users (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id     UUID                REFERENCES auth.users(id) ON DELETE CASCADE,
  employer_id TEXT        NOT NULL,
  niche_id    TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employer_id, niche_id)
);

CREATE INDEX IF NOT EXISTS idx_employer_users_auth_id
  ON public.employer_users(auth_id)
  WHERE auth_id IS NOT NULL;

-- 3. Fix featured-jobs index (Critical Finding 3)
--    The current 0001 index used WHERE is_sponsored = TRUE which does NOT match
--    the featured query pattern (featured_until > NOW()). NOW() is not immutable,
--    so the partial predicate uses IS NOT NULL and the runtime check stays in the query.
DROP INDEX IF EXISTS wind_turbine.idx_jobs_featured;
CREATE INDEX IF NOT EXISTS idx_jobs_featured
  ON wind_turbine.jobs(featured_until DESC NULLS LAST, posted_at DESC)
  WHERE featured_until IS NOT NULL;

-- 4. Custom Access Token Hook — injects employer_id + employer_niche into JWT app_metadata
--    Registered in Supabase Dashboard → Authentication → Hooks (manual step in plan 02).
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  claims     JSONB;
  emp_id     TEXT;
  niche_name TEXT;
BEGIN
  claims := event->'claims';

  SELECT eu.employer_id, eu.niche_id
    INTO emp_id, niche_name
    FROM public.employer_users eu
   WHERE eu.auth_id = (event->>'user_id')::UUID
   LIMIT 1;

  IF emp_id IS NOT NULL THEN
    claims := jsonb_set(
      claims,
      '{app_metadata}',
      COALESCE(claims->'app_metadata', '{}'::JSONB)
        || jsonb_build_object('employer_id', emp_id, 'employer_niche', niche_name)
    );
    event := jsonb_set(event, '{claims}', claims);
  END IF;

  RETURN event;
END;
$$;

GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(JSONB) TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(JSONB) FROM authenticated, anon, public;
