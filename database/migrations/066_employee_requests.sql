CREATE TABLE IF NOT EXISTS employee_requests (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  request_type VARCHAR(40) NOT NULL CHECK (request_type IN ('employment_letter','employment_confirmation','salary_advance','document','workplace','other')),
  subject VARCHAR(180) NOT NULL,
  details TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_review','approved','declined','completed','cancelled')),
  reviewer_id INT REFERENCES employees(id) ON DELETE SET NULL,
  reviewer_note TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employee_requests_company_status ON employee_requests(company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_employee_requests_employee ON employee_requests(employee_id, created_at DESC);
