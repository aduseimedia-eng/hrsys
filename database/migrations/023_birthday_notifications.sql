ALTER TABLE notifications ADD COLUMN IF NOT EXISTS event_key VARCHAR(120);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_event_once
  ON notifications(company_id, employee_id, event_key)
  WHERE event_key IS NOT NULL;
