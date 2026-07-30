CREATE TABLE IF NOT EXISTS employee_queries (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  category VARCHAR(40) NOT NULL DEFAULT 'general',
  subject VARCHAR(180) NOT NULL,
  description TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
  response TEXT,
  responded_by INT REFERENCES employees(id) ON DELETE SET NULL,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_employee_queries_queue ON employee_queries(company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_employee_queries_employee ON employee_queries(company_id, employee_id, created_at DESC);
