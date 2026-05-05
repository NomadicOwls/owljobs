-- OwlJobs niche schema — paste into Supabase SQL Editor.
-- Replace every occurrence of «wind_turbine» with your niche's schema name before running.
-- The provision script (pnpm niche:provision <id>) generates a pre-substituted copy.

CREATE SCHEMA IF NOT EXISTS wind_turbine;

-- pgvector extension is enabled at the database level in Supabase by default.
-- If not, run: CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS wind_turbine.employers (
  id            TEXT PRIMARY KEY,              -- sha256(normalize(name))
  name          TEXT        NOT NULL,
  normalized_name TEXT      NOT NULL,
  ats_type      TEXT        NOT NULL,          -- 'workday' | 'greenhouse' | 'successfactors' | 'direct'
  ats_tenant    TEXT,
  ats_instance  TEXT,                          -- e.g. 'wd1', 'wd3'
  ats_site      TEXT,                          -- Workday site name / Greenhouse board token
  careers_url   TEXT,
  billing_email TEXT,
  plan          TEXT,                          -- NULL | 'featured' | 'subscription'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wind_turbine.jobs (
  id                   TEXT PRIMARY KEY,       -- sha256(canonical_url)
  title                TEXT        NOT NULL,
  employer_id          TEXT        NOT NULL REFERENCES wind_turbine.employers(id),
  location             TEXT,
  country              TEXT,
  posted_at            TIMESTAMPTZ,
  expires_at           TIMESTAMPTZ,
  description          TEXT,
  canonical_url        TEXT        NOT NULL UNIQUE,
  apply_url            TEXT,                   -- override for sponsored direct-apply
  direct_apply         BOOLEAN     NOT NULL DEFAULT FALSE,
  is_sponsored         BOOLEAN     NOT NULL DEFAULT FALSE,
  featured_until       TIMESTAMPTZ,
  embedding            vector(384),            -- bge-small-en via Workers AI
  classification_score REAL,                   -- 0.0–1.0 relevance
  classifier           TEXT,                   -- 'embedding' | 'llm' | 'manual'
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_posted_at
  ON wind_turbine.jobs(posted_at DESC);

CREATE INDEX IF NOT EXISTS idx_jobs_employer
  ON wind_turbine.jobs(employer_id);

CREATE INDEX IF NOT EXISTS idx_jobs_featured
  ON wind_turbine.jobs(featured_until, posted_at DESC)
  WHERE is_sponsored = TRUE;

-- Approximate nearest-neighbour index for embedding similarity search.
-- Uses IVFFlat; tune lists= to sqrt(row_count) once the table has data.
CREATE INDEX IF NOT EXISTS idx_jobs_embedding
  ON wind_turbine.jobs
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE TABLE IF NOT EXISTS wind_turbine.discovered_jobs (
  id              TEXT PRIMARY KEY,            -- sha256(source_url)
  source          TEXT        NOT NULL,        -- 'workday' | 'greenhouse' | 'adzuna' | 'jsearch'
  source_url      TEXT        NOT NULL UNIQUE,
  raw_payload     JSONB,
  employer_hint   TEXT,
  resolved_job_id TEXT        REFERENCES wind_turbine.jobs(id),
  discovered_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wind_turbine.job_sources (
  id           TEXT PRIMARY KEY,
  job_id       TEXT        NOT NULL REFERENCES wind_turbine.jobs(id),
  source       TEXT        NOT NULL,
  source_url   TEXT        NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(job_id, source)
);

CREATE TABLE IF NOT EXISTS wind_turbine.subscribers (
  id               TEXT PRIMARY KEY,
  email            TEXT        NOT NULL UNIQUE,
  locations        JSONB,                      -- array of location strings, NULL = all
  confirmed_at     TIMESTAMPTZ,
  unsubscribe_token TEXT       NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wind_turbine.email_sends (
  id            TEXT PRIMARY KEY,
  subscriber_id TEXT        NOT NULL REFERENCES wind_turbine.subscribers(id),
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  jobs_count    INTEGER     NOT NULL DEFAULT 0
);

-- Auto-update updated_at on jobs
CREATE OR REPLACE FUNCTION wind_turbine.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER jobs_updated_at
  BEFORE UPDATE ON wind_turbine.jobs
  FOR EACH ROW EXECUTE FUNCTION wind_turbine.set_updated_at();

-- Grant access to Supabase roles (required for PostgREST + service_role key)
GRANT USAGE ON SCHEMA wind_turbine TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA wind_turbine TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA wind_turbine TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA wind_turbine TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA wind_turbine GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA wind_turbine GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA wind_turbine GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;
