ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS updated_by INT REFERENCES employees(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION audit_finance_and_payroll_changes()
RETURNS TRIGGER AS $$
DECLARE actor INT; item JSONB; description TEXT; record_company INT; record_id INT;
BEGIN
  IF TG_OP='DELETE' THEN item := to_jsonb(OLD); record_company := OLD.company_id; record_id := OLD.id;
  ELSE item := to_jsonb(NEW); record_company := NEW.company_id; record_id := NEW.id; END IF;
  actor := COALESCE(NULLIF(current_setting('app.actor_id', true), '')::INT,
                    NULLIF(item->>'updated_by', '')::INT, NULLIF(item->>'created_by', '')::INT);
  IF TG_TABLE_NAME = 'financial_transactions' THEN description := COALESCE(item->>'title', 'Financial transaction');
  ELSE description := 'Payroll record'; END IF;
  INSERT INTO audit_logs(company_id, actor_id, action, entity_type, entity_id, summary)
  VALUES (record_company, actor, lower(TG_OP), TG_TABLE_NAME, record_id, description);
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;
