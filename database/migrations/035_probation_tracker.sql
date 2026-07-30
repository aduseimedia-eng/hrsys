CREATE TABLE IF NOT EXISTS employee_probation (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  review_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','passed','extended','failed')),
  outcome_notes TEXT,
  reviewed_by INT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_probation_active ON employee_probation(company_id, employee_id) WHERE status IN ('active','extended');
CREATE INDEX IF NOT EXISTS idx_employee_probation_end ON employee_probation(company_id, end_date, status);
