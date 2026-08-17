-- Company-specific candidate stages used by the recruitment pipeline.
ALTER TABLE candidate_applications DROP CONSTRAINT IF EXISTS candidate_applications_status_check;
ALTER TABLE candidate_applications ALTER COLUMN status TYPE VARCHAR(80);

CREATE TABLE IF NOT EXISTS recruitment_stages (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  stage_key VARCHAR(60) NOT NULL,
  name VARCHAR(100) NOT NULL,
  sort_order INT NOT NULL DEFAULT 100,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE(company_id, stage_key)
);

INSERT INTO recruitment_stages (company_id, stage_key, name, sort_order, is_system)
SELECT c.id, s.stage_key, s.name, s.sort_order, TRUE
FROM companies c
CROSS JOIN (VALUES
  ('submitted', 'Applied', 10), ('screening', 'Screening', 20),
  ('reviewing', 'Reviewing', 25), ('shortlisted', 'Shortlisted', 28),
  ('interview', 'Interview', 30), ('assessment', 'Assessment', 40),
  ('offer', 'Offer', 50), ('hired', 'Hired', 60), ('rejected', 'Rejected', 70)
) AS s(stage_key, name, sort_order)
ON CONFLICT (company_id, stage_key) DO NOTHING;
