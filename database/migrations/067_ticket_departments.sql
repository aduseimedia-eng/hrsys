ALTER TABLE it_tickets ADD COLUMN IF NOT EXISTS target_department_id INT REFERENCES departments(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_it_tickets_target_department ON it_tickets(company_id, target_department_id, status, created_at DESC);
