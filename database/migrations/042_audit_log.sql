CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  actor_id INT REFERENCES employees(id) ON DELETE SET NULL,
  action VARCHAR(30) NOT NULL,
  entity_type VARCHAR(60) NOT NULL,
  entity_id INT NOT NULL,
  summary TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_company_created ON audit_logs(company_id, created_at DESC);

CREATE OR REPLACE FUNCTION audit_finance_and_payroll_changes()
RETURNS TRIGGER AS $$
DECLARE actor INT; item JSONB; description TEXT; record_company INT; record_id INT;
BEGIN
  IF TG_OP='DELETE' THEN item := to_jsonb(OLD); record_company := OLD.company_id; record_id := OLD.id;
  ELSE item := to_jsonb(NEW); record_company := NEW.company_id; record_id := NEW.id; END IF;
  actor := NULLIF(current_setting('app.actor_id', true), '')::INT;
  IF TG_TABLE_NAME = 'financial_transactions' THEN
    description := COALESCE(item->>'title', 'Financial transaction');
  ELSE
    description := 'Payroll record';
  END IF;
  INSERT INTO audit_logs(company_id, actor_id, action, entity_type, entity_id, summary)
  VALUES (record_company, actor, lower(TG_OP), TG_TABLE_NAME, record_id, description);
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_financial_transactions ON financial_transactions;
CREATE TRIGGER trg_audit_financial_transactions AFTER INSERT OR UPDATE OR DELETE ON financial_transactions
FOR EACH ROW EXECUTE FUNCTION audit_finance_and_payroll_changes();
DROP TRIGGER IF EXISTS trg_audit_payroll ON payroll;
CREATE TRIGGER trg_audit_payroll AFTER INSERT OR UPDATE OR DELETE ON payroll
FOR EACH ROW EXECUTE FUNCTION audit_finance_and_payroll_changes();
