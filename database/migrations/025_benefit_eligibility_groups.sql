ALTER TABLE benefits ADD COLUMN IF NOT EXISTS eligible_employment_type VARCHAR(30) NOT NULL DEFAULT 'all';
ALTER TABLE benefits DROP CONSTRAINT IF EXISTS chk_benefits_eligible_employment_type;
ALTER TABLE benefits ADD CONSTRAINT chk_benefits_eligible_employment_type
  CHECK (eligible_employment_type IN ('all', 'staff', 'national_service', 'contractual', 'internship'));
