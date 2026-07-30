ALTER TABLE documents ADD COLUMN IF NOT EXISTS expiry_date DATE;
CREATE INDEX IF NOT EXISTS idx_documents_expiry ON documents(company_id, expiry_date) WHERE expiry_date IS NOT NULL;
