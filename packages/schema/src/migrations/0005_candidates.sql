-- 0005_candidates.sql
-- Auto-discovery candidate table in the global (public) schema.
-- Founder inserts rows; workers/discover probes them and writes ats_type/confidence/probed_at/status back.
-- Apply after 0004_stale_jobs_consent.sql.
--
-- IMPORTANT: This migration is in the public schema (global across all niches).
-- There is NO per-niche substitution token here — apply as-is.

CREATE TABLE IF NOT EXISTS public.candidates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  careers_url TEXT NOT NULL,
  ats_type    TEXT,
  confidence  FLOAT,
  probed_at   TIMESTAMPTZ,
  status      TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','detected','unknown','error')),
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_candidates_status ON public.candidates(status, confidence DESC);
