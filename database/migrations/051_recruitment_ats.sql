CREATE TABLE IF NOT EXISTS job_requisitions (
  id SERIAL PRIMARY KEY, company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title VARCHAR(160) NOT NULL, department_id INT REFERENCES departments(id) ON DELETE SET NULL,
  hiring_manager_id INT REFERENCES employees(id) ON DELETE SET NULL, description TEXT,
  location VARCHAR(160), employment_type VARCHAR(30), status VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('draft','open','closed')), closes_at DATE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE candidate_applications ADD COLUMN IF NOT EXISTS requisition_id INT REFERENCES job_requisitions(id) ON DELETE SET NULL;
ALTER TABLE candidate_applications ADD COLUMN IF NOT EXISTS source VARCHAR(80);
ALTER TABLE candidate_applications ADD COLUMN IF NOT EXISTS rating SMALLINT CHECK (rating BETWEEN 1 AND 5);
ALTER TABLE candidate_applications ADD COLUMN IF NOT EXISTS owner_id INT REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE candidate_applications ADD COLUMN IF NOT EXISTS hired_employee_id INT REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE candidate_applications DROP CONSTRAINT IF EXISTS candidate_applications_status_check;
ALTER TABLE candidate_applications ADD CONSTRAINT candidate_applications_status_check CHECK (status IN ('submitted','screening','interview','assessment','offer','hired','rejected','reviewing','shortlisted'));
CREATE TABLE IF NOT EXISTS candidate_notes (
  id SERIAL PRIMARY KEY, application_id INT NOT NULL REFERENCES candidate_applications(id) ON DELETE CASCADE,
  author_id INT REFERENCES employees(id) ON DELETE SET NULL, body TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS candidate_interviews (
  id SERIAL PRIMARY KEY, application_id INT NOT NULL REFERENCES candidate_applications(id) ON DELETE CASCADE,
  interviewer_id INT REFERENCES employees(id) ON DELETE SET NULL, scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 45, meeting_location VARCHAR(300), score SMALLINT CHECK (score BETWEEN 1 AND 5), feedback TEXT, status VARCHAR(20) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed','cancelled')), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS candidate_offers (
  id SERIAL PRIMARY KEY, application_id INT NOT NULL UNIQUE REFERENCES candidate_applications(id) ON DELETE CASCADE,
  salary NUMERIC(12,2), start_date DATE, message TEXT, status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','accepted','declined')), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_requisitions_company ON job_requisitions(company_id, status);
CREATE INDEX IF NOT EXISTS idx_candidate_applications_requisition ON candidate_applications(requisition_id, status);
