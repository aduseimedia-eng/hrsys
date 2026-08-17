-- Align the recruitment pipeline with the end-to-end recruitment workflow.
UPDATE recruitment_stages SET name = 'Applications' WHERE stage_key = 'submitted';
UPDATE recruitment_stages SET name = 'Shortlisting' WHERE stage_key = 'shortlisted';
UPDATE recruitment_stages SET name = 'Assessments' WHERE stage_key = 'assessment';
UPDATE recruitment_stages SET name = 'Interviews' WHERE stage_key = 'interview';
UPDATE recruitment_stages SET name = 'Job Offer' WHERE stage_key = 'offer';

INSERT INTO recruitment_stages (company_id, stage_key, name, sort_order, is_system)
SELECT c.id, s.stage_key, s.name, s.sort_order, TRUE
FROM companies c
CROSS JOIN (VALUES
  ('reference-checks', 'Reference Checks', 45),
  ('selection', 'Selection', 48),
  ('offer-acceptance', 'Offer Acceptance', 55),
  ('pre-employment', 'Pre-Employment', 58)
) AS s(stage_key, name, sort_order)
ON CONFLICT (company_id, stage_key) DO NOTHING;
