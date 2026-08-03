CREATE TABLE IF NOT EXISTS company_assets (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  asset_code VARCHAR(80) NOT NULL,
  name VARCHAR(180) NOT NULL,
  category VARCHAR(80) NOT NULL DEFAULT 'other',
  serial_number VARCHAR(160),
  status VARCHAR(30) NOT NULL DEFAULT 'available' CHECK (status IN ('available','assigned','maintenance','retired','lost')),
  condition VARCHAR(30) NOT NULL DEFAULT 'good' CHECK (condition IN ('new','good','fair','poor')),
  assigned_to INT REFERENCES employees(id) ON DELETE SET NULL,
  assigned_at DATE,
  purchase_date DATE,
  purchase_cost NUMERIC(14,2),
  notes TEXT,
  created_by INT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, asset_code)
);
CREATE INDEX IF NOT EXISTS idx_company_assets_assignment ON company_assets(company_id, assigned_to, status);
