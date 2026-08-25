-- Finalised payroll outputs are immutable. Corrections are represented by a
-- subsequent adjustment/run rather than altering the completed calculation.
CREATE OR REPLACE FUNCTION prevent_finalized_payroll_output_changes()
RETURNS TRIGGER AS $$
DECLARE run_status VARCHAR(30);
BEGIN
  SELECT status INTO run_status
  FROM payroll_runs
  WHERE id = CASE WHEN TG_OP='DELETE' THEN OLD.payroll_run_id ELSE NEW.payroll_run_id END;

  IF run_status IN ('finalized', 'paid') THEN
    RAISE EXCEPTION 'Finalized payroll outputs cannot be changed';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_lock_finalized_payroll_results
  BEFORE INSERT OR UPDATE OR DELETE ON payroll_results
  FOR EACH ROW EXECUTE FUNCTION prevent_finalized_payroll_output_changes();
CREATE TRIGGER trg_lock_finalized_payroll_line_items
  BEFORE INSERT OR UPDATE OR DELETE ON payroll_line_items
  FOR EACH ROW EXECUTE FUNCTION prevent_finalized_payroll_output_changes();
CREATE TRIGGER trg_lock_finalized_payroll_adjustments
  BEFORE INSERT OR UPDATE OR DELETE ON payroll_adjustments
  FOR EACH ROW EXECUTE FUNCTION prevent_finalized_payroll_output_changes();
