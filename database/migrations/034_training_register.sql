CREATE TABLE IF NOT EXISTS employee_training (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  course_title VARCHAR(200) NOT NULL,
  provider VARCHAR(160),
  training_type VARCHAR(80),
  start_date DATE,
  completion_date DATE,
  certificate_number VARCHAR(120),
  certificate_expiry DATE,
  cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','in_progress','completed','expired')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_employee_training_company ON employee_training(company_id, employee_id, completion_date DESC);
CREATE INDEX IF NOT EXISTS idx_employee_training_expiry ON employee_training(company_id, certificate_expiry) WHERE certificate_expiry IS NOT NULL;
