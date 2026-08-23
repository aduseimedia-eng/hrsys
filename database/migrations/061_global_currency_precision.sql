-- Supported ISO currencies use between zero and four fractional digits. Keep four
-- decimal places so every supported company currency can be stored exactly.
ALTER TABLE employees
  ALTER COLUMN salary TYPE NUMERIC(16,4);

ALTER TABLE candidate_offers
  ALTER COLUMN salary TYPE NUMERIC(16,4);

ALTER TABLE company_overtime_settings
  ALTER COLUMN hourly_rate TYPE NUMERIC(16,4);

-- net_salary depends on the payroll amount columns, so recreate it around the
-- precision changes.
ALTER TABLE payroll DROP COLUMN net_salary;
ALTER TABLE payroll
  ALTER COLUMN base_salary TYPE NUMERIC(16,4),
  ALTER COLUMN allowances TYPE NUMERIC(16,4),
  ALTER COLUMN overtime_pay TYPE NUMERIC(16,4),
  ALTER COLUMN tax TYPE NUMERIC(16,4),
  ALTER COLUMN ssnit_employee TYPE NUMERIC(16,4),
  ALTER COLUMN ssnit_employer TYPE NUMERIC(16,4),
  ALTER COLUMN pensionable_earnings TYPE NUMERIC(16,4),
  ALTER COLUMN pension_tier1 TYPE NUMERIC(16,4),
  ALTER COLUMN pension_tier2 TYPE NUMERIC(16,4),
  ALTER COLUMN other_deductions TYPE NUMERIC(16,4),
  ALTER COLUMN benefit_deductions TYPE NUMERIC(16,4),
  ALTER COLUMN loan_deductions TYPE NUMERIC(16,4),
  ALTER COLUMN deductions TYPE NUMERIC(16,4);
ALTER TABLE payroll
  ADD COLUMN net_salary NUMERIC(16,4)
  GENERATED ALWAYS AS (base_salary + allowances + overtime_pay - deductions) STORED;

ALTER TABLE benefits
  ALTER COLUMN employee_cost TYPE NUMERIC(16,4),
  ALTER COLUMN employer_cost TYPE NUMERIC(16,4);

ALTER TABLE financial_transactions
  ALTER COLUMN amount TYPE NUMERIC(16,4);

ALTER TABLE company_assets
  ALTER COLUMN purchase_cost TYPE NUMERIC(16,4);

ALTER TABLE employee_loans
  ALTER COLUMN principal_amount TYPE NUMERIC(16,4),
  ALTER COLUMN remaining_balance TYPE NUMERIC(16,4),
  ALTER COLUMN monthly_repayment TYPE NUMERIC(16,4);

ALTER TABLE employee_training
  ALTER COLUMN cost TYPE NUMERIC(16,4);

ALTER TABLE operations_register_entries
  ALTER COLUMN amount TYPE NUMERIC(16,4);
