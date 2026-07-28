CREATE TABLE IF NOT EXISTS company_calendar_events (
  id          SERIAL PRIMARY KEY,
  company_id  INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title       VARCHAR(180) NOT NULL,
  description TEXT,
  category    VARCHAR(30) NOT NULL DEFAULT 'event'
              CHECK (category IN ('event','meeting','payday','shutdown','holiday')),
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  created_by  INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS idx_company_calendar_events_dates ON company_calendar_events(company_id, start_date, end_date);
CREATE TRIGGER trg_company_calendar_events_updated_at
  BEFORE UPDATE ON company_calendar_events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
