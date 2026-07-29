CREATE INDEX IF NOT EXISTS idx_notifications_employee_recent
  ON notifications(company_id, employee_id, created_at DESC);
