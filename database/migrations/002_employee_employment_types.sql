-- Add National Service Personnel and Internship staff categories.

ALTER TABLE employees
  DROP CONSTRAINT IF EXISTS employees_employment_type_check;

ALTER TABLE employees
  ALTER COLUMN employment_type TYPE VARCHAR(30);

ALTER TABLE employees
  ADD CONSTRAINT employees_employment_type_check
  CHECK (employment_type IN ('staff','contractual','national_service','internship'));
