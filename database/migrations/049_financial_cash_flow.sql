ALTER TABLE financial_transactions
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(30) NOT NULL DEFAULT 'bank';

ALTER TABLE financial_transactions
  DROP CONSTRAINT IF EXISTS chk_financial_transactions_payment_method;

ALTER TABLE financial_transactions
  ADD CONSTRAINT chk_financial_transactions_payment_method
  CHECK (payment_method IN ('cash', 'bank', 'mobile_money', 'other'));

CREATE INDEX IF NOT EXISTS idx_financial_transactions_company_cash
  ON financial_transactions(company_id, payment_method, status)
  WHERE payment_method = 'cash' AND status = 'paid';
