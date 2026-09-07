CREATE TABLE IF NOT EXISTS company_leave_settings (
  company_id INT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  annual_entitlement_days INT NOT NULL DEFAULT 20 CHECK (annual_entitlement_days BETWEEN 1 AND 365),
  count_weekends BOOLEAN NOT NULL DEFAULT true,
  count_public_holidays BOOLEAN NOT NULL DEFAULT true,
  max_consecutive_days INT CHECK (max_consecutive_days BETWEEN 1 AND 365),
  minimum_notice_days INT NOT NULL DEFAULT 0 CHECK (minimum_notice_days BETWEEN 0 AND 365),
  updated_by INT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (max_consecutive_days IS NULL OR max_consecutive_days <= annual_entitlement_days)
);
