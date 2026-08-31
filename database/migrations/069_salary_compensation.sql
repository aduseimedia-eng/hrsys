CREATE TABLE IF NOT EXISTS salary_records (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  basic_salary NUMERIC(16,4) NOT NULL CHECK (basic_salary >= 0),
  allowances NUMERIC(16,4) NOT NULL DEFAULT 0 CHECK (allowances >= 0),
  ssnit_insurable_salary NUMERIC(16,4) NOT NULL CHECK (ssnit_insurable_salary >= 0),
  gross_salary NUMERIC(16,4) NOT NULL DEFAULT 0,
  employee_ssnit NUMERIC(16,4) NOT NULL DEFAULT 0,
  employer_ssnit NUMERIC(16,4) NOT NULL DEFAULT 0,
  tier1_contribution NUMERIC(16,4) NOT NULL DEFAULT 0,
  tier2_contribution NUMERIC(16,4) NOT NULL DEFAULT 0,
  paye NUMERIC(16,4) NOT NULL DEFAULT 0,
  other_deductions NUMERIC(16,4) NOT NULL DEFAULT 0,
  estimated_net_salary NUMERIC(16,4) NOT NULL DEFAULT 0,
  effective_from DATE NOT NULL,
  effective_to DATE,
  status VARCHAR(12) NOT NULL DEFAULT 'current' CHECK (status IN ('current','previous')),
  created_by INT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_salary_records_one_current ON salary_records(employee_id) WHERE status='current';
CREATE INDEX IF NOT EXISTS idx_salary_records_company_employee ON salary_records(company_id, employee_id, effective_from DESC);
