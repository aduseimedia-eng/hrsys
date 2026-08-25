-- Global country rules are defaults. A legal employer can schedule its own
-- effective-dated override without changing any other company's payroll.
ALTER TABLE statutory_rule_versions ADD COLUMN IF NOT EXISTS company_id INT REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE statutory_rule_versions DROP CONSTRAINT IF EXISTS statutory_rule_versions_statutory_rule_id_version_key;
ALTER TABLE statutory_rule_versions ADD CONSTRAINT statutory_rule_versions_rule_company_version_key UNIQUE(statutory_rule_id, company_id, version);
CREATE INDEX IF NOT EXISTS idx_rule_versions_company_effective ON statutory_rule_versions(company_id, effective_from, effective_to) WHERE active=true;
