CREATE TABLE IF NOT EXISTS employee_disciplinary_cases (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  case_date DATE NOT NULL,
  category VARCHAR(80) NOT NULL,
  incident_summary TEXT NOT NULL,
  action_taken VARCHAR(120) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open','under_review','resolved','closed')),
  follow_up_date DATE,
  outcome_notes TEXT,
  recorded_by INT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_disciplinary_cases_company ON employee_disciplinary_cases(company_id, case_date DESC);
CREATE INDEX IF NOT EXISTS idx_disciplinary_cases_employee ON employee_disciplinary_cases(company_id, employee_id, case_date DESC);
CREATE INDEX IF NOT EXISTS idx_disciplinary_cases_follow_up ON employee_disciplinary_cases(company_id, follow_up_date) WHERE follow_up_date IS NOT NULL;
