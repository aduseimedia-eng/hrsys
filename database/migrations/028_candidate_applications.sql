CREATE TABLE IF NOT EXISTS candidate_applications (
  id SERIAL PRIMARY KEY, company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  full_name VARCHAR(160) NOT NULL, email VARCHAR(160) NOT NULL, phone VARCHAR(40),
  role_applied VARCHAR(160), cover_note TEXT, status VARCHAR(20) NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted','reviewing','shortlisted','rejected')),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS candidate_documents (
  id SERIAL PRIMARY KEY, application_id INT NOT NULL REFERENCES candidate_applications(id) ON DELETE CASCADE,
  document_type VARCHAR(40) NOT NULL, original_name VARCHAR(255) NOT NULL, mime_type VARCHAR(150), file_data BYTEA NOT NULL, uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_candidate_applications_company ON candidate_applications(company_id, submitted_at DESC);
