CREATE TABLE IF NOT EXISTS work_schedules (
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

CREATE TABLE IF NOT EXISTS employee_schedule_assignments (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  schedule_id INT NOT NULL REFERENCES work_schedules(id) ON DELETE CASCADE,
  starts_on DATE NOT NULL DEFAULT CURRENT_DATE,
  ends_on DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_on IS NULL OR ends_on >= starts_on)
);

CREATE INDEX IF NOT EXISTS idx_work_schedules_company ON work_schedules(company_id);
CREATE INDEX IF NOT EXISTS idx_schedule_assignments_employee ON employee_schedule_assignments(company_id, employee_id, starts_on);
