CREATE TABLE IF NOT EXISTS operations_register_entries (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  register_type VARCHAR(50) NOT NULL,
  entry_date DATE NOT NULL,
  title VARCHAR(180) NOT NULL,
  contact_name VARCHAR(180),
  reference_no VARCHAR(100),
  amount NUMERIC(14,2),
  due_date DATE,
  status VARCHAR(30) NOT NULL DEFAULT 'open',
  notes TEXT,
  created_by INT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operations_register_type ON operations_register_entries(company_id, register_type, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_operations_register_due ON operations_register_entries(company_id, due_date) WHERE due_date IS NOT NULL;
