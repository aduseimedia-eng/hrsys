CREATE TABLE IF NOT EXISTS company_overtime_settings (
  company_id INT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  hourly_rate NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (hourly_rate >= 0),
  late_clock_out_after TIME NOT NULL DEFAULT TIME '17:30',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS overtime_requests (
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
CREATE INDEX IF NOT EXISTS idx_overtime_requests_company_period ON overtime_requests(company_id, work_date, status);

ALTER TABLE payroll ADD COLUMN IF NOT EXISTS overtime_hours NUMERIC(8,2) NOT NULL DEFAULT 0;
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS overtime_pay NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE payroll DROP COLUMN IF EXISTS net_salary;
ALTER TABLE payroll ADD COLUMN net_salary NUMERIC(12,2) GENERATED ALWAYS AS (base_salary + allowances + overtime_pay - deductions) STORED;
