-- Build the vacancy lifecycle separately from the candidate lifecycle.
-- Existing requisitions remain valid and are backfilled as approved records.

CREATE TABLE IF NOT EXISTS recruitment_requests (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  request_number VARCHAR(40),
  title VARCHAR(160) NOT NULL,
  department_id INT REFERENCES departments(id) ON DELETE SET NULL,
  requested_by_id INT REFERENCES employees(id) ON DELETE SET NULL,
  hiring_manager_id INT REFERENCES employees(id) ON DELETE SET NULL,
  headcount INT NOT NULL DEFAULT 1 CHECK (headcount > 0),
  employment_type VARCHAR(30),
  location VARCHAR(160),
  justification TEXT,
  target_start_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','approved','rejected','converted')),
  reviewed_by_id INT REFERENCES employees(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  reviewer_note TEXT,
  converted_requisition_id INT REFERENCES job_requisitions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recruitment_request_approvals (
  id SERIAL PRIMARY KEY,
  request_id INT NOT NULL REFERENCES recruitment_requests(id) ON DELETE CASCADE,
  reviewer_id INT REFERENCES employees(id) ON DELETE SET NULL,
  decision VARCHAR(20) NOT NULL CHECK (decision IN ('submitted','approved','rejected')),
  note TEXT,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE job_requisitions
  ADD COLUMN IF NOT EXISTS request_id INT REFERENCES recruitment_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS requisition_code VARCHAR(40),
  ADD COLUMN IF NOT EXISTS headcount INT NOT NULL DEFAULT 1 CHECK (headcount > 0),
  ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) NOT NULL DEFAULT 'approved'
    CHECK (approval_status IN ('draft','pending','approved','rejected')),
  ADD COLUMN IF NOT EXISTS approved_by_id INT REFERENCES employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approval_note TEXT,
  ADD COLUMN IF NOT EXISTS target_start_date DATE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE job_requisitions
SET requisition_code = 'REQ-' || LPAD(id::text, 6, '0')
WHERE requisition_code IS NULL;

UPDATE job_requisitions
SET approval_status = CASE WHEN status = 'draft' THEN 'draft' ELSE 'approved' END
WHERE approval_status IS NULL OR approval_status = 'approved';

CREATE UNIQUE INDEX IF NOT EXISTS idx_recruitment_requests_company_number
  ON recruitment_requests(company_id, request_number)
  WHERE request_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_job_requisitions_company_code
  ON job_requisitions(company_id, requisition_code)
  WHERE requisition_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_recruitment_requests_company_status
  ON recruitment_requests(company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recruitment_request_approvals_request
  ON recruitment_request_approvals(request_id, decided_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_requisitions_company_approval
  ON job_requisitions(company_id, approval_status, status);

CREATE TABLE IF NOT EXISTS job_postings (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  requisition_id INT NOT NULL REFERENCES job_requisitions(id) ON DELETE CASCADE,
  channel VARCHAR(30) NOT NULL CHECK (channel IN ('internal','company-site','external')),
  title VARCHAR(160) NOT NULL,
  summary TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','published','closed')),
  published_at TIMESTAMPTZ,
  closes_at DATE,
  external_url VARCHAR(500),
  created_by_id INT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(requisition_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_job_postings_company_status
  ON job_postings(company_id, status, closes_at);

-- Preserve the existing behaviour for current open requisitions while giving
-- HR explicit internal and careers-site posting records to manage going forward.
INSERT INTO job_postings (company_id, requisition_id, channel, title, status, published_at, closes_at, created_by_id)
SELECT r.company_id, r.id, channels.channel, r.title, 'published', r.created_at, r.closes_at, r.hiring_manager_id
FROM job_requisitions r
CROSS JOIN (VALUES ('internal'), ('company-site')) AS channels(channel)
WHERE r.status = 'open'
ON CONFLICT (requisition_id, channel) DO NOTHING;

ALTER TABLE candidate_applications
  ADD COLUMN IF NOT EXISTS rejected_reason TEXT,
  ADD COLUMN IF NOT EXISTS hired_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS candidate_stage_events (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  application_id INT NOT NULL REFERENCES candidate_applications(id) ON DELETE CASCADE,
  from_stage_key VARCHAR(60),
  to_stage_key VARCHAR(60) NOT NULL,
  changed_by_id INT REFERENCES employees(id) ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_candidate_stage_events_application
  ON candidate_stage_events(application_id, created_at DESC);

INSERT INTO candidate_stage_events (company_id, application_id, to_stage_key, note, created_at)
SELECT a.company_id, a.id, a.status, 'Initial pipeline stage', a.submitted_at
FROM candidate_applications a
WHERE NOT EXISTS (
  SELECT 1 FROM candidate_stage_events e WHERE e.application_id = a.id
);

ALTER TABLE candidate_offers
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS declined_at TIMESTAMPTZ;

UPDATE candidate_offers
SET sent_at = created_at
WHERE status IN ('sent','accepted','declined') AND sent_at IS NULL;
UPDATE candidate_offers
SET accepted_at = updated_at
WHERE status = 'accepted' AND accepted_at IS NULL;
UPDATE candidate_offers
SET declined_at = updated_at
WHERE status = 'declined' AND declined_at IS NULL;

-- Keep the configured default workflow aligned with the operational sequence.
UPDATE recruitment_stages
SET sort_order = CASE stage_key
  WHEN 'submitted' THEN 10 WHEN 'screening' THEN 20 WHEN 'reviewing' THEN 25
  WHEN 'shortlisted' THEN 30 WHEN 'assessment' THEN 40 WHEN 'interview' THEN 50
  WHEN 'reference-checks' THEN 60 WHEN 'selection' THEN 70 WHEN 'offer' THEN 80
  WHEN 'offer-acceptance' THEN 90 WHEN 'pre-employment' THEN 100 WHEN 'hired' THEN 110
  WHEN 'rejected' THEN 999 ELSE sort_order END
WHERE stage_key IN ('submitted','screening','reviewing','shortlisted','assessment','interview','reference-checks','selection','offer','offer-acceptance','pre-employment','hired','rejected');
