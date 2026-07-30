-- ============================================================
-- KenadHR - PostgreSQL Schema
-- Multi-company ready
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE companies (
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

CREATE TABLE departments (
  id          SERIAL PRIMARY KEY,
  company_id  INT NOT NULL DEFAULT 1 REFERENCES companies(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  manager_id  INT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (company_id, name)
);

CREATE TABLE employees (
  id             SERIAL PRIMARY KEY,
  company_id     INT NOT NULL DEFAULT 1 REFERENCES companies(id) ON DELETE CASCADE,
  first_name     VARCHAR(80)  NOT NULL,
  last_name      VARCHAR(80)  NOT NULL,
  email          VARCHAR(150) NOT NULL,
  employee_code  VARCHAR(50),
  password_hash  TEXT         NOT NULL,
  role           VARCHAR(20)  NOT NULL DEFAULT 'employee'
                   CHECK (role IN ('admin','manager','employee')),
  employment_type VARCHAR(30) NOT NULL DEFAULT 'staff'
                   CHECK (employment_type IN ('staff','contractual','national_service','internship')),
  department_id  INT REFERENCES departments(id) ON DELETE SET NULL,
  manager_id     INT REFERENCES employees(id)   ON DELETE SET NULL,
  job_title      VARCHAR(120),
  salary         NUMERIC(12,2) DEFAULT 0,
  hire_date      DATE,
  phone          VARCHAR(30),
  phone_verified_at TIMESTAMPTZ,
  address        TEXT,
  date_of_birth  DATE,
  education_information TEXT,
  education_level VARCHAR(140),
  education_institution VARCHAR(180),
  education_field VARCHAR(180),
  graduation_year VARCHAR(20),
  experience     TEXT,
  previous_company VARCHAR(180),
  previous_job_title VARCHAR(180),
  experience_years VARCHAR(40),
  experience_summary TEXT,
  emergency_contact_name VARCHAR(160),
  emergency_contact_relationship VARCHAR(80),
  emergency_contact_phone VARCHAR(30),
  emergency_contact_address TEXT,
  bank_name      VARCHAR(140),
  bank_account_name VARCHAR(160),
  bank_account_number VARCHAR(80),
  bank_branch    VARCHAR(140),
  photo_url      VARCHAR(300),
  photo_data     BYTEA,
  photo_mime_type VARCHAR(100),
  is_active      BOOLEAN DEFAULT TRUE,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (email),
  UNIQUE (company_id, email)
);

-- Pending first-time HR registrations. The password is stored only as a bcrypt hash
-- until the phone number has been verified through the OTP provider.
CREATE TABLE hr_signup_otps (
  id            VARCHAR(64) PRIMARY KEY,
  company_name  VARCHAR(120) NOT NULL,
  full_name     VARCHAR(160) NOT NULL,
  email         VARCHAR(160) NOT NULL,
  phone         VARCHAR(20) NOT NULL,
  password_hash TEXT NOT NULL,
  plan_key      VARCHAR(80) NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Pending codes used when an HR-created staff account signs in for the first time.
CREATE TABLE staff_login_otps (
  id            VARCHAR(64) PRIMARY KEY,
  employee_id   INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  phone         VARCHAR(20) NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE departments
  ADD CONSTRAINT fk_dept_manager
  FOREIGN KEY (manager_id) REFERENCES employees(id) ON DELETE SET NULL;

CREATE TABLE attendance (
  id           SERIAL PRIMARY KEY,
  company_id   INT NOT NULL DEFAULT 1 REFERENCES companies(id) ON DELETE CASCADE,
  employee_id  INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  work_date    DATE NOT NULL,
  clock_in     TIMESTAMPTZ,
  clock_out    TIMESTAMPTZ,
  clock_in_latitude NUMERIC(9,6),
  clock_in_longitude NUMERIC(9,6),
  clock_in_accuracy_meters NUMERIC(8,2),
  clock_out_latitude NUMERIC(9,6),
  clock_out_longitude NUMERIC(9,6),
  clock_out_accuracy_meters NUMERIC(8,2),
  status       VARCHAR(20) DEFAULT 'present'
                 CHECK (status IN ('present','absent','late','half-day','on-leave')),
  notes        TEXT,
  UNIQUE (employee_id, work_date)
);

CREATE TABLE leave_requests (
  id           SERIAL PRIMARY KEY,
  company_id   INT NOT NULL DEFAULT 1 REFERENCES companies(id) ON DELETE CASCADE,
  employee_id  INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  approved_by  INT REFERENCES employees(id) ON DELETE SET NULL,
  leave_type   VARCHAR(40) NOT NULL
                 CHECK (leave_type IN ('annual','sick','maternity','paternity','personal','unpaid','other')),
  start_date   DATE NOT NULL,
  end_date     DATE NOT NULL,
  reason       TEXT,
  status       VARCHAR(20) DEFAULT 'pending'
                 CHECK (status IN ('pending','approved','rejected','cancelled')),
  approved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE company_overtime_settings (
  company_id INT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  hourly_rate NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (hourly_rate >= 0),
  late_clock_out_after TIME NOT NULL DEFAULT TIME '17:30',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE overtime_requests (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  attendance_id INT NOT NULL UNIQUE REFERENCES attendance(id) ON DELETE CASCADE,
  employee_id INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  reason TEXT NOT NULL CHECK (char_length(trim(reason)) BETWEEN 3 AND 1000),
  overtime_hours NUMERIC(6,2) NOT NULL CHECK (overtime_hours > 0),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  approved_by INT REFERENCES employees(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_overtime_requests_company_period ON overtime_requests(company_id, work_date, status);

CREATE TABLE payroll (
  id            SERIAL PRIMARY KEY,
  company_id    INT NOT NULL DEFAULT 1 REFERENCES companies(id) ON DELETE CASCADE,
  employee_id   INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  month         SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
  year          SMALLINT NOT NULL,
  base_salary   NUMERIC(12,2) NOT NULL,
  allowances    NUMERIC(12,2) DEFAULT 0,
  overtime_hours NUMERIC(8,2) NOT NULL DEFAULT 0,
  overtime_pay NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax           NUMERIC(12,2) DEFAULT 0,
  ssnit_employee NUMERIC(12,2) DEFAULT 0,
  ssnit_employer NUMERIC(12,2) DEFAULT 0,
  other_deductions NUMERIC(12,2) DEFAULT 0,
  deductions    NUMERIC(12,2) DEFAULT 0,
  net_salary    NUMERIC(12,2) GENERATED ALWAYS AS (base_salary + allowances + overtime_pay - deductions) STORED,
  status        VARCHAR(20) DEFAULT 'pending'
                  CHECK (status IN ('pending','processed','paid')),
  paid_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (employee_id, month, year)
);

CREATE TABLE documents (
  id            SERIAL PRIMARY KEY,
  company_id    INT NOT NULL DEFAULT 1 REFERENCES companies(id) ON DELETE CASCADE,
  employee_id   INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  doc_type      VARCHAR(60) NOT NULL
                  CHECK (doc_type IN ('contract','certificate','id','offer_letter','other')),
  title         VARCHAR(200) NOT NULL,
  file_path     VARCHAR(400) NOT NULL,
  original_name VARCHAR(200) NOT NULL,
  file_size     INT,
  mime_type     VARCHAR(150),
  file_data     BYTEA,
  share_with_hr BOOLEAN DEFAULT TRUE,
  shared_with   INT REFERENCES employees(id) ON DELETE SET NULL,
  uploaded_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE performance_reviews (
  id           SERIAL PRIMARY KEY,
  company_id   INT NOT NULL DEFAULT 1 REFERENCES companies(id) ON DELETE CASCADE,
  employee_id  INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  reviewer_id  INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  rating       SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comments     TEXT,
  review_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  period       VARCHAR(40),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE notifications (
  id           SERIAL PRIMARY KEY,
  company_id   INT NOT NULL DEFAULT 1 REFERENCES companies(id) ON DELETE CASCADE,
  employee_id  INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  type         VARCHAR(50) NOT NULL,
  message      TEXT NOT NULL,
  link         VARCHAR(300),
  is_read      BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_employee_recent
  ON notifications(company_id, employee_id, created_at DESC);

CREATE TABLE push_subscriptions (
  id              SERIAL PRIMARY KEY,
  company_id      INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id     INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  endpoint        TEXT NOT NULL UNIQUE,
  p256dh          TEXT NOT NULL,
  auth            TEXT NOT NULL,
  expiration_time TIMESTAMPTZ,
  user_agent      VARCHAR(500),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_push_subscriptions_employee ON push_subscriptions(company_id, employee_id);

CREATE TABLE announcements (
  id          SERIAL PRIMARY KEY,
  company_id  INT NOT NULL DEFAULT 1 REFERENCES companies(id) ON DELETE CASCADE,
  created_by  INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  title       VARCHAR(200) NOT NULL,
  body        TEXT NOT NULL,
  is_pinned   BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE messages (
  id           SERIAL PRIMARY KEY,
  company_id   INT NOT NULL DEFAULT 1 REFERENCES companies(id) ON DELETE CASCADE,
  sender_id    INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  receiver_id  INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  body         TEXT NOT NULL,
  is_read      BOOLEAN DEFAULT FALSE,
  sent_at      TIMESTAMPTZ DEFAULT NOW(),
  edited_at    TIMESTAMPTZ
);

CREATE TABLE team_messages (
  id           SERIAL PRIMARY KEY,
  company_id   INT NOT NULL DEFAULT 1 REFERENCES companies(id) ON DELETE CASCADE,
  sender_id    INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  body         TEXT NOT NULL,
  sent_at      TIMESTAMPTZ DEFAULT NOW(),
  edited_at    TIMESTAMPTZ
);

CREATE TABLE todos (
  id            SERIAL PRIMARY KEY,
  company_id    INT NOT NULL DEFAULT 1 REFERENCES companies(id) ON DELETE CASCADE,
  title         VARCHAR(200) NOT NULL,
  detail        TEXT,
  owner         VARCHAR(80) DEFAULT 'Everyone',
  owner_type    VARCHAR(20) DEFAULT 'everyone'
                  CHECK (owner_type IN ('everyone','hr','managers','employee')),
  assigned_employee_id INT REFERENCES employees(id) ON DELETE SET NULL,
  due_date      DATE,
  priority      VARCHAR(20) DEFAULT 'Normal'
                  CHECK (priority IN ('Low','Normal','Medium','High')),
  link          VARCHAR(300),
  completed     BOOLEAN DEFAULT FALSE,
  completed_by  INT REFERENCES employees(id) ON DELETE SET NULL,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE it_tickets (
  id            SERIAL PRIMARY KEY,
  company_id    INT NOT NULL DEFAULT 1 REFERENCES companies(id) ON DELETE CASCADE,
  ticket_number VARCHAR(40) NOT NULL UNIQUE,
  employee_id   INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  category      VARCHAR(30) NOT NULL DEFAULT 'other'
                  CHECK (category IN ('laptop','email','access','software','network','hr_system','other')),
  priority      VARCHAR(20) NOT NULL DEFAULT 'medium'
                  CHECK (priority IN ('low','medium','high')),
  subject       VARCHAR(200) NOT NULL,
  description   TEXT NOT NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','in_progress','resolved','closed')),
  response      TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  resolved_at   TIMESTAMPTZ
);

CREATE TABLE company_subscriptions (
  company_id              INT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  plan_key                VARCHAR(80) NOT NULL,
  status                  VARCHAR(20) NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','active','expired','cancelled')),
  payment_reference       VARCHAR(140) UNIQUE,
  amount                  BIGINT NOT NULL CHECK (amount > 0),
  currency                VARCHAR(10) NOT NULL,
  paystack_customer_code  VARCHAR(100),
  starts_at               TIMESTAMPTZ,
  ends_at                 TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE company_calendar_events (
  id          SERIAL PRIMARY KEY,
  company_id  INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title       VARCHAR(180) NOT NULL,
  description TEXT,
  category    VARCHAR(30) NOT NULL DEFAULT 'event'
              CHECK (category IN ('event','meeting','payday','shutdown','holiday')),
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  created_by  INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_date >= start_date)
);

CREATE TABLE work_schedules (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  break_minutes INT NOT NULL DEFAULT 0 CHECK (break_minutes >= 0 AND break_minutes <= 720),
  weekdays SMALLINT[] NOT NULL DEFAULT ARRAY[1,2,3,4,5],
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE employee_schedule_assignments (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  schedule_id INT NOT NULL REFERENCES work_schedules(id) ON DELETE CASCADE,
  starts_on DATE NOT NULL DEFAULT CURRENT_DATE,
  ends_on DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_on IS NULL OR ends_on >= starts_on)
);

CREATE TABLE billing_payments (
  id            BIGSERIAL PRIMARY KEY,
  company_id    INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  reference     VARCHAR(140) NOT NULL UNIQUE,
  plan_key      VARCHAR(80) NOT NULL,
  amount        BIGINT NOT NULL CHECK (amount > 0),
  currency      VARCHAR(10) NOT NULL,
  status        VARCHAR(30) NOT NULL,
  paid_at       TIMESTAMPTZ,
  provider_data JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_departments_company   ON departments(company_id);
CREATE INDEX idx_employees_company     ON employees(company_id, is_active);
CREATE INDEX idx_employees_department  ON employees(department_id);
CREATE INDEX idx_attendance_employee   ON attendance(employee_id);
CREATE UNIQUE INDEX idx_employees_company_employee_code ON employees(company_id, employee_code) WHERE employee_code IS NOT NULL;
CREATE INDEX idx_attendance_company    ON attendance(company_id, work_date);
CREATE INDEX idx_attendance_date       ON attendance(work_date);
CREATE INDEX idx_leave_employee        ON leave_requests(employee_id);
CREATE INDEX idx_leave_company         ON leave_requests(company_id, status, start_date);
CREATE INDEX idx_leave_status          ON leave_requests(status);
CREATE INDEX idx_payroll_employee      ON payroll(employee_id);
CREATE INDEX idx_payroll_company       ON payroll(company_id, year, month);
CREATE INDEX idx_documents_company     ON documents(company_id, uploaded_at);
CREATE INDEX idx_reviews_company       ON performance_reviews(company_id, review_date);
CREATE INDEX idx_notifications_emp     ON notifications(employee_id, is_read);
CREATE INDEX idx_notifications_company ON notifications(company_id, created_at);
CREATE INDEX idx_messages_receiver     ON messages(receiver_id, is_read);
CREATE INDEX idx_messages_company      ON messages(company_id, sent_at);
CREATE INDEX idx_todos_completed       ON todos(completed, due_date);
CREATE INDEX idx_todos_company         ON todos(company_id, completed, due_date);
CREATE INDEX idx_it_tickets_status     ON it_tickets(status, priority);
CREATE INDEX idx_it_tickets_number     ON it_tickets(ticket_number);
CREATE INDEX idx_it_tickets_employee   ON it_tickets(employee_id, created_at);
CREATE INDEX idx_it_tickets_company    ON it_tickets(company_id, status, created_at);
CREATE INDEX idx_billing_payments_company ON billing_payments(company_id, created_at DESC);
CREATE INDEX idx_company_calendar_events_dates ON company_calendar_events(company_id, start_date, end_date);
CREATE INDEX idx_work_schedules_company ON work_schedules(company_id);
CREATE INDEX idx_schedule_assignments_employee ON employee_schedule_assignments(company_id, employee_id, starts_on);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_companies_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_employees_updated_at
  BEFORE UPDATE ON employees
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_company_subscriptions_updated_at
  BEFORE UPDATE ON company_subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_company_calendar_events_updated_at
  BEFORE UPDATE ON company_calendar_events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

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

CREATE TRIGGER trg_attendance_company
  BEFORE INSERT ON attendance
  FOR EACH ROW EXECUTE FUNCTION set_company_from_employee();

CREATE TRIGGER trg_leave_company
  BEFORE INSERT ON leave_requests
  FOR EACH ROW EXECUTE FUNCTION set_company_from_employee();

CREATE TRIGGER trg_payroll_company
  BEFORE INSERT ON payroll
  FOR EACH ROW EXECUTE FUNCTION set_company_from_employee();

CREATE TRIGGER trg_documents_company
  BEFORE INSERT ON documents
  FOR EACH ROW EXECUTE FUNCTION set_company_from_employee();

CREATE TRIGGER trg_reviews_company
  BEFORE INSERT ON performance_reviews
  FOR EACH ROW EXECUTE FUNCTION set_company_from_employee();

CREATE TRIGGER trg_notifications_company
  BEFORE INSERT ON notifications
  FOR EACH ROW EXECUTE FUNCTION set_company_from_employee();

CREATE TRIGGER trg_tickets_company
  BEFORE INSERT ON it_tickets
  FOR EACH ROW EXECUTE FUNCTION set_company_from_employee();

CREATE TRIGGER trg_announcements_company
  BEFORE INSERT ON announcements
  FOR EACH ROW EXECUTE FUNCTION set_company_from_created_by();

CREATE TRIGGER trg_messages_company
  BEFORE INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION set_company_from_sender();
