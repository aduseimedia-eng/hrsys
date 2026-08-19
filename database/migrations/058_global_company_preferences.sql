ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS locale VARCHAR(35) NOT NULL DEFAULT 'en-GB',
  ADD COLUMN IF NOT EXISTS date_format VARCHAR(24) NOT NULL DEFAULT 'DD/MM/YYYY',
  ADD COLUMN IF NOT EXISTS week_start VARCHAR(12) NOT NULL DEFAULT 'Monday';

-- Existing companies keep their chosen values. New workspaces begin with
-- neutral international defaults and select their own regional preferences.
ALTER TABLE companies
  ALTER COLUMN country SET DEFAULT '',
  ALTER COLUMN timezone SET DEFAULT 'UTC',
  ALTER COLUMN currency SET DEFAULT 'USD';
