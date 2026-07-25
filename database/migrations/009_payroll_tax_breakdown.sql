ALTER TABLE payroll ADD COLUMN IF NOT EXISTS tax NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE payroll ADD COLUMN IF NOT EXISTS other_deductions NUMERIC(12,2) NOT NULL DEFAULT 0;

UPDATE payroll
SET tax = deductions,
    other_deductions = 0
WHERE tax = 0 AND other_deductions = 0 AND deductions <> 0;
