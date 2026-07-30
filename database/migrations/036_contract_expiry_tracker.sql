CREATE TABLE IF NOT EXISTS employee_contracts (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  contract_type VARCHAR(100) NOT NULL DEFAULT 'Employment contract',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  notice_days INT NOT NULL DEFAULT 30 CHECK (notice_days >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','renewed','expired','terminated')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_employee_contracts_end ON employee_contracts(company_id, end_date, status);
