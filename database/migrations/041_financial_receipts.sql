ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS receipt_name VARCHAR(255);
ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS receipt_mime_type VARCHAR(150);
ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS receipt_size INT;
ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS receipt_data BYTEA;
