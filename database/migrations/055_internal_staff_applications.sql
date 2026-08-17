-- Link an internal application to its existing staff profile.
ALTER TABLE candidate_applications
  ADD COLUMN IF NOT EXISTS applicant_employee_id INT REFERENCES employees(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_candidate_applications_internal_employee_requisition
  ON candidate_applications(company_id, requisition_id, applicant_employee_id)
  WHERE applicant_employee_id IS NOT NULL;
