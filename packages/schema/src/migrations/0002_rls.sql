-- RLS policies for the wind_turbine schema.
-- Apply via Supabase SQL editor or `supabase db push`.

ALTER TABLE wind_turbine.jobs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE wind_turbine.employers   ENABLE ROW LEVEL SECURITY;
ALTER TABLE wind_turbine.job_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE wind_turbine.subscribers ENABLE ROW LEVEL SECURITY;

-- Expired sponsorships intentionally excluded from anon reads.
CREATE POLICY public_relevant_jobs ON wind_turbine.jobs FOR SELECT TO anon
  USING (
    classification_score >= 0.6
    OR (is_sponsored AND (featured_until IS NULL OR featured_until > now()))
  );

CREATE POLICY public_employers   ON wind_turbine.employers   FOR SELECT TO anon USING (true);
CREATE POLICY public_job_sources ON wind_turbine.job_sources FOR SELECT TO anon USING (true);

-- subscribers: no anon policy — only service_role (which bypasses RLS) reads/writes
