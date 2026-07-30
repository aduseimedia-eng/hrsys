ALTER TABLE employees ADD COLUMN IF NOT EXISTS employee_code VARCHAR(50);
CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_company_employee_code
  ON employees(company_id, employee_code)
  WHERE employee_code IS NOT NULL;
