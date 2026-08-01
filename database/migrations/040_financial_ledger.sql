CREATE TABLE IF NOT EXISTS financial_transactions (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('income', 'expense')),
  category VARCHAR(50) NOT NULL,
  transaction_date DATE NOT NULL,
  title VARCHAR(180) NOT NULL,
  payee_or_source VARCHAR(180),
  reference_no VARCHAR(100),
  amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  due_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'paid' CHECK (status IN ('draft', 'pending', 'paid', 'void')),
  notes TEXT,
  created_by INT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_financial_transactions_company_period
  ON financial_transactions(company_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_financial_transactions_due
  ON financial_transactions(company_id, due_date) WHERE due_date IS NOT NULL;

-- Preserve existing finance-related register records when upgrading.
INSERT INTO financial_transactions (company_id, transaction_type, category, transaction_date, title, payee_or_source, reference_no, amount, due_date, status, notes, created_by)
SELECT company_id, 'expense', register_type, entry_date, title, contact_name, reference_no,
       COALESCE(amount, 0), due_date,
       CASE WHEN status IN ('open', 'active') THEN 'pending' WHEN status='closed' THEN 'void' WHEN status='completed' THEN 'paid' ELSE status END,
       notes, created_by
FROM operations_register_entries
WHERE register_type IN ('petty_cash', 'office_expense', 'vehicle_fuel', 'vehicle_maintenance', 'office_maintenance', 'quarterly_rent', 'ecg_bill', 'ghana_water_bill', 'internet_telephone');
