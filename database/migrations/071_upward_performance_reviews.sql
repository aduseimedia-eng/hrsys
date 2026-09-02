CREATE TABLE IF NOT EXISTS performance_review_cycles (
  id          SERIAL PRIMARY KEY,
  company_id  INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title       VARCHAR(160) NOT NULL,
  period      VARCHAR(40),
  target_type VARCHAR(24) NOT NULL CHECK (target_type IN ('supervisors', 'department_heads')),
  is_anonymous BOOLEAN NOT NULL DEFAULT FALSE,
  is_open     BOOLEAN NOT NULL DEFAULT TRUE,
  closes_at   DATE,
  created_by_id INT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS performance_review_responses (
  id          SERIAL PRIMARY KEY,
  cycle_id    INT NOT NULL REFERENCES performance_review_cycles(id) ON DELETE CASCADE,
  company_id  INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  reviewer_id INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  subject_employee_id INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  rating      SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comments    TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cycle_id, reviewer_id)
);

CREATE INDEX IF NOT EXISTS idx_performance_review_cycles_company
  ON performance_review_cycles(company_id, is_open, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_performance_review_responses_cycle
  ON performance_review_responses(cycle_id, subject_employee_id);
