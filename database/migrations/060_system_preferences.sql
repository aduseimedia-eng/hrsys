ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS announcement_expiry_days INT NOT NULL DEFAULT 30 CHECK (announcement_expiry_days BETWEEN 1 AND 3650),
  ADD COLUMN IF NOT EXISTS default_records_per_page INT NOT NULL DEFAULT 25 CHECK (default_records_per_page BETWEEN 5 AND 200),
  ADD COLUMN IF NOT EXISTS employee_code_prefix VARCHAR(20) NOT NULL DEFAULT 'EMP-',
  ADD COLUMN IF NOT EXISTS currency_symbol VARCHAR(8),
  ADD COLUMN IF NOT EXISTS currency_symbol_position VARCHAR(8) NOT NULL DEFAULT 'prefix' CHECK (currency_symbol_position IN ('prefix','suffix'));

ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
