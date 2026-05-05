-- Adds niche scoping + confirmation_token to wind_turbine.subscribers.
-- Reconciles with 0001_initial.sql which already has:
--   unsubscribe_token TEXT NOT NULL
--   UNIQUE(email)   → replaced by UNIQUE(email, niche)
--
-- Apply via Supabase SQL editor after 0001_initial.sql is live.

ALTER TABLE wind_turbine.subscribers
  ADD COLUMN niche              TEXT NOT NULL DEFAULT 'wind-turbine',
  ADD COLUMN confirmation_token TEXT;

-- Drop the default — every insert must supply the niche explicitly.
ALTER TABLE wind_turbine.subscribers ALTER COLUMN niche DROP DEFAULT;

-- Swap single-email uniqueness for (email, niche) composite.
ALTER TABLE wind_turbine.subscribers DROP CONSTRAINT subscribers_email_key;
ALTER TABLE wind_turbine.subscribers
  ADD CONSTRAINT subscribers_email_niche_key UNIQUE (email, niche);

-- Partial unique index: only one pending confirmation per (email, niche) at a time.
CREATE UNIQUE INDEX subscribers_confirmation_token_key
  ON wind_turbine.subscribers (confirmation_token)
  WHERE confirmation_token IS NOT NULL;

-- Ensure unsubscribe tokens stay unique (column already NOT NULL from 0001).
CREATE UNIQUE INDEX IF NOT EXISTS subscribers_unsubscribe_token_key
  ON wind_turbine.subscribers (unsubscribe_token);
