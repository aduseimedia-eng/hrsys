ALTER TABLE employee_queries ADD COLUMN IF NOT EXISTS recipient_employee_id INT REFERENCES employees(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_employee_queries_recipient ON employee_queries(company_id, recipient_employee_id, created_at DESC);
