-- Adds (CAND-03 — email digest idempotency):
--   wind_turbine.email_sends.sent_date  DATE NOT NULL DEFAULT CURRENT_DATE
--   wind_turbine.email_sends.type       TEXT NOT NULL DEFAULT 'digest'
-- + UNIQUE constraint (subscriber_id, sent_date, type) — blocks duplicate digest sends per UTC day
--
-- Per Phase 3 D-16: insert-before-send pattern in workers/digest uses this constraint
-- as the idempotency gate. Postgres `CURRENT_DATE` is UTC; the Worker computes
-- `sent_date` as `new Date().toISOString().slice(0, 10)` to match.
--
-- Replace every occurrence of «wind_turbine» with the niche schema name before running
-- (or use pnpm niche:provision <id> which substitutes for you).
--
-- Apply via Supabase SQL editor AFTER 0001_initial.sql + 0002_rls.sql + 0003_subscribers_multi_niche.sql + 0004_stale_jobs_consent.sql + 0005_candidates.sql.
--
-- Multi-niche note: every new niche must run this migration as part of provisioning.

ALTER TABLE wind_turbine.email_sends
  ADD COLUMN sent_date DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN type      TEXT NOT NULL DEFAULT 'digest';

ALTER TABLE wind_turbine.email_sends
  ADD CONSTRAINT email_sends_subscriber_date_type_key
    UNIQUE (subscriber_id, sent_date, type);
