-- ============================================================
-- KenadHR migration: add multi-company support
-- Run this against an existing single-company database.
-- ============================================================

CREATE TABLE IF NOT EXISTS companies (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(160) NOT NULL UNIQUE,
  slug        VARCHAR(80)  NOT NULL UNIQUE,
  email       VARCHAR(160),
  phone       VARCHAR(40),
  address     TEXT,
  logo_url    VARCHAR(300),
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO companies (id, name, slug, email)
VALUES (1, 'KenadHR Demo Company', 'kenad-hr-demo', 'admin@company.com')
ON CONFLICT (id) DO NOTHING;

SELECT setval(pg_get_serial_sequence('companies', 'id'), GREATEST((SELECT MAX(id) FROM companies), 1));

ALTER TABLE departments ADD COLUMN IF NOT EXISTS company_id INT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS company_id INT;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS company_id INT;
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS company_id INT;
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS company_id INT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS company_id INT;
ALTER TABLE performance_reviews ADD COLUMN IF NOT EXISTS company_id INT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS company_id INT;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS company_id INT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS company_id INT;
ALTER TABLE todos ADD COLUMN IF NOT EXISTS company_id INT;
ALTER TABLE it_tickets ADD COLUMN IF NOT EXISTS company_id INT;

UPDATE departments SET company_id = 1 WHERE company_id IS NULL;
UPDATE employees SET company_id = 1 WHERE company_id IS NULL;
UPDATE attendance SET company_id = 1 WHERE company_id IS NULL;
UPDATE leave_requests SET company_id = 1 WHERE company_id IS NULL;
UPDATE payroll SET company_id = 1 WHERE company_id IS NULL;
UPDATE documents SET company_id = 1 WHERE company_id IS NULL;
UPDATE performance_reviews SET company_id = 1 WHERE company_id IS NULL;
UPDATE notifications SET company_id = 1 WHERE company_id IS NULL;
UPDATE announcements SET company_id = 1 WHERE company_id IS NULL;
UPDATE messages SET company_id = 1 WHERE company_id IS NULL;
UPDATE todos SET company_id = 1 WHERE company_id IS NULL;
UPDATE it_tickets SET company_id = 1 WHERE company_id IS NULL;

ALTER TABLE departments ALTER COLUMN company_id SET DEFAULT 1;
ALTER TABLE employees ALTER COLUMN company_id SET DEFAULT 1;
ALTER TABLE attendance ALTER COLUMN company_id SET DEFAULT 1;
ALTER TABLE leave_requests ALTER COLUMN company_id SET DEFAULT 1;
ALTER TABLE payroll ALTER COLUMN company_id SET DEFAULT 1;
ALTER TABLE documents ALTER COLUMN company_id SET DEFAULT 1;
ALTER TABLE performance_reviews ALTER COLUMN company_id SET DEFAULT 1;
ALTER TABLE notifications ALTER COLUMN company_id SET DEFAULT 1;
ALTER TABLE announcements ALTER COLUMN company_id SET DEFAULT 1;
ALTER TABLE messages ALTER COLUMN company_id SET DEFAULT 1;
ALTER TABLE todos ALTER COLUMN company_id SET DEFAULT 1;
ALTER TABLE it_tickets ALTER COLUMN company_id SET DEFAULT 1;

ALTER TABLE departments ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE employees ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE attendance ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE leave_requests ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE payroll ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE documents ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE performance_reviews ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE notifications ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE announcements ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE messages ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE todos ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE it_tickets ALTER COLUMN company_id SET NOT NULL;

ALTER TABLE departments
  ADD CONSTRAINT fk_departments_company
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE employees
  ADD CONSTRAINT fk_employees_company
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE attendance
  ADD CONSTRAINT fk_attendance_company
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE leave_requests
  ADD CONSTRAINT fk_leave_company
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE payroll
  ADD CONSTRAINT fk_payroll_company
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE documents
  ADD CONSTRAINT fk_documents_company
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE performance_reviews
  ADD CONSTRAINT fk_reviews_company
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE notifications
  ADD CONSTRAINT fk_notifications_company
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE announcements
  ADD CONSTRAINT fk_announcements_company
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE messages
  ADD CONSTRAINT fk_messages_company
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE todos
  ADD CONSTRAINT fk_todos_company
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE it_tickets
  ADD CONSTRAINT fk_it_tickets_company
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_departments_company   ON departments(company_id);
CREATE INDEX IF NOT EXISTS idx_employees_company     ON employees(company_id, is_active);
CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_email_unique ON employees(email);
CREATE INDEX IF NOT EXISTS idx_attendance_company    ON attendance(company_id, work_date);
CREATE INDEX IF NOT EXISTS idx_leave_company         ON leave_requests(company_id, status, start_date);
CREATE INDEX IF NOT EXISTS idx_payroll_company       ON payroll(company_id, year, month);
CREATE INDEX IF NOT EXISTS idx_documents_company     ON documents(company_id, uploaded_at);
CREATE INDEX IF NOT EXISTS idx_reviews_company       ON performance_reviews(company_id, review_date);
CREATE INDEX IF NOT EXISTS idx_notifications_company ON notifications(company_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_company      ON messages(company_id, sent_at);
CREATE INDEX IF NOT EXISTS idx_todos_company         ON todos(company_id, completed, due_date);
CREATE INDEX IF NOT EXISTS idx_it_tickets_company    ON it_tickets(company_id, status, created_at);

CREATE OR REPLACE FUNCTION set_company_from_employee()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.company_id IS NULL OR NEW.company_id = 1 THEN
    SELECT company_id INTO NEW.company_id FROM employees WHERE id = NEW.employee_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_company_from_created_by()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.company_id IS NULL OR NEW.company_id = 1 THEN
    SELECT company_id INTO NEW.company_id FROM employees WHERE id = NEW.created_by;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_company_from_sender()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.company_id IS NULL OR NEW.company_id = 1 THEN
    SELECT company_id INTO NEW.company_id FROM employees WHERE id = NEW.sender_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_attendance_company ON attendance;
CREATE TRIGGER trg_attendance_company
  BEFORE INSERT ON attendance
  FOR EACH ROW EXECUTE FUNCTION set_company_from_employee();

DROP TRIGGER IF EXISTS trg_leave_company ON leave_requests;
CREATE TRIGGER trg_leave_company
  BEFORE INSERT ON leave_requests
  FOR EACH ROW EXECUTE FUNCTION set_company_from_employee();

DROP TRIGGER IF EXISTS trg_payroll_company ON payroll;
CREATE TRIGGER trg_payroll_company
  BEFORE INSERT ON payroll
  FOR EACH ROW EXECUTE FUNCTION set_company_from_employee();

DROP TRIGGER IF EXISTS trg_documents_company ON documents;
CREATE TRIGGER trg_documents_company
  BEFORE INSERT ON documents
  FOR EACH ROW EXECUTE FUNCTION set_company_from_employee();

DROP TRIGGER IF EXISTS trg_reviews_company ON performance_reviews;
CREATE TRIGGER trg_reviews_company
  BEFORE INSERT ON performance_reviews
  FOR EACH ROW EXECUTE FUNCTION set_company_from_employee();

DROP TRIGGER IF EXISTS trg_notifications_company ON notifications;
CREATE TRIGGER trg_notifications_company
  BEFORE INSERT ON notifications
  FOR EACH ROW EXECUTE FUNCTION set_company_from_employee();

DROP TRIGGER IF EXISTS trg_tickets_company ON it_tickets;
CREATE TRIGGER trg_tickets_company
  BEFORE INSERT ON it_tickets
  FOR EACH ROW EXECUTE FUNCTION set_company_from_employee();

DROP TRIGGER IF EXISTS trg_announcements_company ON announcements;
CREATE TRIGGER trg_announcements_company
  BEFORE INSERT ON announcements
  FOR EACH ROW EXECUTE FUNCTION set_company_from_created_by();

DROP TRIGGER IF EXISTS trg_messages_company ON messages;
CREATE TRIGGER trg_messages_company
  BEFORE INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION set_company_from_sender();
