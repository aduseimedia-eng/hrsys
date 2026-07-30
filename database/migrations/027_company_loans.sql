CREATE TABLE IF NOT EXISTS employee_loans (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  principal_amount NUMERIC(12,2) NOT NULL CHECK (principal_amount > 0),
  remaining_balance NUMERIC(12,2) NOT NULL CHECK (remaining_balance >= 0),
  monthly_repayment NUMERIC(12,2) NOT NULL CHECK (monthly_repayment > 0),
  start_date DATE NOT NULL,
  reason TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','paid','cancelled')),
  approved_by INT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_employee_loans_payroll ON employee_loans(company_id, employee_id, status, start_date);
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS loan_deductions NUMERIC(12,2) NOT NULL DEFAULT 0;
