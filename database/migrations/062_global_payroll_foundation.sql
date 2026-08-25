-- Global payroll foundation. Existing payroll records remain untouched while
-- new runs and profiles adopt country, legal-entity, and effective-dated rules.

CREATE TABLE IF NOT EXISTS countries (
  id SERIAL PRIMARY KEY,
  iso_code VARCHAR(2) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  currency_code VARCHAR(8) NOT NULL,
  currency_symbol VARCHAR(8),
  default_timezone VARCHAR(80) NOT NULL DEFAULT 'UTC',
  default_locale VARCHAR(35) NOT NULL DEFAULT 'en-GB',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO countries (iso_code, name, currency_code, currency_symbol, default_timezone, default_locale)
VALUES
  ('GH', 'Ghana', 'GHS', 'GH₵', 'Africa/Accra', 'en-GH'),
  ('NG', 'Nigeria', 'NGN', '₦', 'Africa/Lagos', 'en-NG'),
  ('KE', 'Kenya', 'KES', 'KSh', 'Africa/Nairobi', 'en-KE'),
  ('ZA', 'South Africa', 'ZAR', 'R', 'Africa/Johannesburg', 'en-ZA'),
  ('GB', 'United Kingdom', 'GBP', '£', 'Europe/London', 'en-GB'),
  ('US', 'United States', 'USD', '$', 'America/New_York', 'en-US')
ON CONFLICT (iso_code) DO UPDATE SET
  name=EXCLUDED.name, currency_code=EXCLUDED.currency_code,
  currency_symbol=EXCLUDED.currency_symbol, default_timezone=EXCLUDED.default_timezone,
  default_locale=EXCLUDED.default_locale, updated_at=NOW();

CREATE TABLE IF NOT EXISTS legal_entities (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  country_id INT NOT NULL REFERENCES countries(id),
  name VARCHAR(160) NOT NULL,
  registration_number VARCHAR(100),
  tax_identifier VARCHAR(100),
  currency_code VARCHAR(8) NOT NULL,
  timezone VARCHAR(80) NOT NULL DEFAULT 'UTC',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, name)
);

INSERT INTO legal_entities (company_id, country_id, name, currency_code, timezone)
SELECT c.id, COALESCE(country_row.id, gh.id), COALESCE(NULLIF(c.legal_name, ''), c.name), c.currency, c.timezone
FROM companies c
CROSS JOIN (SELECT id FROM countries WHERE iso_code='GH') gh
LEFT JOIN countries country_row ON upper(country_row.iso_code) = upper(COALESCE(NULLIF(c.country, ''), 'GH'))
WHERE NOT EXISTS (SELECT 1 FROM legal_entities le WHERE le.company_id=c.id);

CREATE TABLE IF NOT EXISTS payroll_country_configs (
  id SERIAL PRIMARY KEY,
  country_id INT NOT NULL REFERENCES countries(id),
  enabled BOOLEAN NOT NULL DEFAULT true,
  effective_from DATE NOT NULL,
  effective_to DATE,
  version VARCHAR(40) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','retired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  UNIQUE(country_id, version)
);

INSERT INTO payroll_country_configs(country_id, enabled, effective_from, version, status)
SELECT id, true, DATE '2024-01-01', 'GH-2024.01', 'active' FROM countries WHERE iso_code='GH'
ON CONFLICT (country_id, version) DO NOTHING;

CREATE TABLE IF NOT EXISTS pay_groups (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  legal_entity_id INT NOT NULL REFERENCES legal_entities(id) ON DELETE CASCADE,
  country_id INT NOT NULL REFERENCES countries(id),
  name VARCHAR(160) NOT NULL,
  currency_code VARCHAR(8) NOT NULL,
  pay_frequency VARCHAR(20) NOT NULL CHECK (pay_frequency IN ('monthly','biweekly','weekly','semi_monthly','daily','custom')),
  pay_day SMALLINT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, name),
  CHECK (pay_day IS NULL OR pay_day BETWEEN 1 AND 31)
);

INSERT INTO pay_groups(company_id, legal_entity_id, country_id, name, currency_code, pay_frequency, pay_day)
SELECT le.company_id, le.id, le.country_id, 'Default monthly payroll', le.currency_code, 'monthly', 28
FROM legal_entities le
WHERE NOT EXISTS (SELECT 1 FROM pay_groups pg WHERE pg.company_id=le.company_id);

CREATE TABLE IF NOT EXISTS employee_payroll_profiles (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  legal_entity_id INT NOT NULL REFERENCES legal_entities(id),
  country_id INT NOT NULL REFERENCES countries(id),
  pay_group_id INT REFERENCES pay_groups(id) ON DELETE SET NULL,
  currency_code VARCHAR(8) NOT NULL,
  pay_frequency VARCHAR(20) NOT NULL DEFAULT 'monthly' CHECK (pay_frequency IN ('monthly','biweekly','weekly','semi_monthly','daily','custom')),
  payment_method VARCHAR(20) NOT NULL DEFAULT 'bank' CHECK (payment_method IN ('bank','cash','mobile_money','other')),
  payroll_status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (payroll_status IN ('active','suspended','inactive')),
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  UNIQUE(employee_id, effective_from)
);

INSERT INTO employee_payroll_profiles(company_id, employee_id, legal_entity_id, country_id, pay_group_id, currency_code, effective_from)
SELECT e.company_id, e.id, le.id, le.country_id, pg.id, le.currency_code, COALESCE(e.hire_date, CURRENT_DATE)
FROM employees e
JOIN LATERAL (SELECT * FROM legal_entities le WHERE le.company_id=e.company_id ORDER BY le.id LIMIT 1) le ON true
LEFT JOIN LATERAL (SELECT * FROM pay_groups pg WHERE pg.company_id=e.company_id ORDER BY pg.id LIMIT 1) pg ON true
WHERE NOT EXISTS (SELECT 1 FROM employee_payroll_profiles pp WHERE pp.employee_id=e.id);

CREATE TABLE IF NOT EXISTS statutory_rules (
  id SERIAL PRIMARY KEY,
  country_id INT NOT NULL REFERENCES countries(id),
  code VARCHAR(80) NOT NULL,
  name VARCHAR(160) NOT NULL,
  category VARCHAR(30) NOT NULL CHECK (category IN ('tax','social_security','pension','health_insurance','employer_contribution','other_statutory')),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(country_id, code)
);

CREATE TABLE IF NOT EXISTS statutory_rule_versions (
  id SERIAL PRIMARY KEY,
  statutory_rule_id INT NOT NULL REFERENCES statutory_rules(id) ON DELETE CASCADE,
  version VARCHAR(40) NOT NULL,
  calculation_type VARCHAR(30) NOT NULL CHECK (calculation_type IN ('percentage','fixed','progressive','tiered','percentage_with_floor','percentage_with_ceiling','formula')),
  calculation_basis VARCHAR(30) NOT NULL CHECK (calculation_basis IN ('basic_salary','gross_pay','taxable_pay','pensionable_pay','annual_income','monthly_income','custom')),
  employee_rate NUMERIC(12,8), employer_rate NUMERIC(12,8), fixed_amount NUMERIC(19,4),
  minimum_amount NUMERIC(19,4), maximum_amount NUMERIC(19,4), currency_code VARCHAR(8),
  formula_expression TEXT,
  effective_from DATE NOT NULL, effective_to DATE,
  priority INT NOT NULL DEFAULT 100, active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CHECK (employee_rate IS NULL OR employee_rate >= 0), CHECK (employer_rate IS NULL OR employer_rate >= 0),
  UNIQUE(statutory_rule_id, version)
);

CREATE TABLE IF NOT EXISTS tax_brackets (
  id SERIAL PRIMARY KEY,
  statutory_rule_version_id INT NOT NULL REFERENCES statutory_rule_versions(id) ON DELETE CASCADE,
  lower_bound NUMERIC(19,4) NOT NULL DEFAULT 0,
  upper_bound NUMERIC(19,4),
  rate NUMERIC(12,8) NOT NULL DEFAULT 0,
  fixed_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (lower_bound >= 0), CHECK (upper_bound IS NULL OR upper_bound >= lower_bound), CHECK (rate >= 0)
);

CREATE TABLE IF NOT EXISTS payroll_runs (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  legal_entity_id INT NOT NULL REFERENCES legal_entities(id),
  pay_group_id INT REFERENCES pay_groups(id),
  country_id INT NOT NULL REFERENCES countries(id),
  currency_code VARCHAR(8) NOT NULL,
  period_start DATE NOT NULL, period_end DATE NOT NULL, payment_date DATE,
  status VARCHAR(30) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','calculating','calculated','pending_approval','approved','finalized','paid','cancelled')),
  rule_set_version VARCHAR(40), calculation_engine_version VARCHAR(40),
  created_by INT REFERENCES employees(id) ON DELETE SET NULL,
  approved_by INT REFERENCES employees(id) ON DELETE SET NULL, approved_at TIMESTAMPTZ, finalized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (period_end >= period_start), UNIQUE(company_id, pay_group_id, period_start, period_end)
);

CREATE TABLE IF NOT EXISTS payroll_results (
  id SERIAL PRIMARY KEY,
  payroll_run_id INT NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id INT NOT NULL REFERENCES employees(id), currency_code VARCHAR(8) NOT NULL,
  gross_pay NUMERIC(19,4) NOT NULL DEFAULT 0, taxable_pay NUMERIC(19,4) NOT NULL DEFAULT 0, pensionable_pay NUMERIC(19,4) NOT NULL DEFAULT 0,
  employee_tax NUMERIC(19,4) NOT NULL DEFAULT 0, employee_social_security NUMERIC(19,4) NOT NULL DEFAULT 0, employee_pension NUMERIC(19,4) NOT NULL DEFAULT 0, employee_other_deductions NUMERIC(19,4) NOT NULL DEFAULT 0,
  employer_tax NUMERIC(19,4) NOT NULL DEFAULT 0, employer_social_security NUMERIC(19,4) NOT NULL DEFAULT 0, employer_pension NUMERIC(19,4) NOT NULL DEFAULT 0, employer_other_contributions NUMERIC(19,4) NOT NULL DEFAULT 0,
  total_employee_deductions NUMERIC(19,4) NOT NULL DEFAULT 0, net_pay NUMERIC(19,4) NOT NULL DEFAULT 0, total_employer_cost NUMERIC(19,4) NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','calculated','approved','finalized','paid','cancelled')),
  calculation_version VARCHAR(40), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(payroll_run_id, employee_id)
);

CREATE TABLE IF NOT EXISTS payroll_line_items (
  id SERIAL PRIMARY KEY,
  payroll_result_id INT NOT NULL REFERENCES payroll_results(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('earning','deduction','contribution','tax','adjustment')),
  code VARCHAR(80) NOT NULL, name VARCHAR(160) NOT NULL, amount NUMERIC(19,4) NOT NULL,
  party VARCHAR(20) NOT NULL CHECK (party IN ('employee','employer')),
  taxable BOOLEAN NOT NULL DEFAULT false, pensionable BOOLEAN NOT NULL DEFAULT false,
  statutory_rule_id INT REFERENCES statutory_rules(id), statutory_rule_version_id INT REFERENCES statutory_rule_versions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payroll_adjustments (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  payroll_run_id INT NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id INT NOT NULL REFERENCES employees(id),
  type VARCHAR(30) NOT NULL CHECK (type IN ('bonus','correction','salary_adjustment','retroactive_payment','deduction_correction','reimbursement')),
  reason TEXT NOT NULL, amount NUMERIC(19,4) NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_approval','approved','rejected','applied')),
  approved_by INT REFERENCES employees(id) ON DELETE SET NULL, created_by INT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_legal_entities_company ON legal_entities(company_id, country_id);
CREATE INDEX IF NOT EXISTS idx_pay_groups_company ON pay_groups(company_id, legal_entity_id);
CREATE INDEX IF NOT EXISTS idx_payroll_profiles_employee ON employee_payroll_profiles(company_id, employee_id, effective_from DESC);
CREATE INDEX IF NOT EXISTS idx_rule_versions_effective ON statutory_rule_versions(statutory_rule_id, effective_from, effective_to) WHERE active=true;
CREATE INDEX IF NOT EXISTS idx_payroll_runs_company_period ON payroll_runs(company_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_payroll_results_run ON payroll_results(payroll_run_id, employee_id);

INSERT INTO statutory_rules(country_id, code, name, category, description)
SELECT id, 'GH-SSNIT', 'SSNIT employee and employer contribution', 'social_security', 'Ghana social-security contribution'
FROM countries WHERE iso_code='GH' ON CONFLICT (country_id, code) DO NOTHING;
INSERT INTO statutory_rules(country_id, code, name, category, description)
SELECT id, 'GH-PAYE', 'PAYE income tax', 'tax', 'Ghana progressive monthly income tax'
FROM countries WHERE iso_code='GH' ON CONFLICT (country_id, code) DO NOTHING;

INSERT INTO statutory_rule_versions(statutory_rule_id, version, calculation_type, calculation_basis, employee_rate, employer_rate, maximum_amount, currency_code, effective_from, priority)
SELECT sr.id, 'GH-2026.01', 'percentage_with_ceiling', 'pensionable_pay', 0.055, 0.13, 5750, 'GHS', DATE '2026-01-01', 10
FROM statutory_rules sr JOIN countries c ON c.id=sr.country_id
WHERE c.iso_code='GH' AND sr.code='GH-SSNIT'
ON CONFLICT (statutory_rule_id, version) DO NOTHING;
INSERT INTO statutory_rule_versions(statutory_rule_id, version, calculation_type, calculation_basis, currency_code, effective_from, priority)
SELECT sr.id, 'GH-2024.01', 'progressive', 'monthly_income', 'GHS', DATE '2024-01-01', 20
FROM statutory_rules sr JOIN countries c ON c.id=sr.country_id
WHERE c.iso_code='GH' AND sr.code='GH-PAYE'
ON CONFLICT (statutory_rule_id, version) DO NOTHING;

INSERT INTO tax_brackets(statutory_rule_version_id, lower_bound, upper_bound, rate)
SELECT rv.id, bands.lower_bound, bands.upper_bound, bands.rate
FROM statutory_rule_versions rv
JOIN statutory_rules sr ON sr.id=rv.statutory_rule_id
JOIN countries c ON c.id=sr.country_id
CROSS JOIN (VALUES
  (0::NUMERIC, 490::NUMERIC, 0::NUMERIC), (490::NUMERIC, 600::NUMERIC, .05::NUMERIC),
  (600::NUMERIC, 730::NUMERIC, .10::NUMERIC), (730::NUMERIC, 3896.67::NUMERIC, .175::NUMERIC),
  (3896.67::NUMERIC, 19896.67::NUMERIC, .25::NUMERIC), (19896.67::NUMERIC, 50416.67::NUMERIC, .30::NUMERIC),
  (50416.67::NUMERIC, NULL::NUMERIC, .35::NUMERIC)
) AS bands(lower_bound, upper_bound, rate)
WHERE c.iso_code='GH' AND sr.code='GH-PAYE' AND rv.version='GH-2024.01'
  AND NOT EXISTS (SELECT 1 FROM tax_brackets existing WHERE existing.statutory_rule_version_id=rv.id);
