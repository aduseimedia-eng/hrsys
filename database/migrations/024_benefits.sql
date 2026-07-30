CREATE TABLE IF NOT EXISTS benefits (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  category VARCHAR(80) NOT NULL DEFAULT 'other',
  provider VARCHAR(160),
  description TEXT,
  eligibility TEXT,
  employee_cost NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (employee_cost >= 0),
  employer_cost NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (employer_cost >= 0),
  enrollment_info TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by INT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_benefits_company_active ON benefits(company_id, is_active);
