-- Require a fresh SMS confirmation code for every HR/Admin and manager sign-in.
CREATE TABLE IF NOT EXISTS hr_login_otps (
  id            VARCHAR(64) PRIMARY KEY,
  employee_id   INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  phone         VARCHAR(20) NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS hr_login_otps_employee_created_idx
  ON hr_login_otps (employee_id, created_at DESC);
