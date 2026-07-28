-- Older deployments may have created this table before the holiday category
-- was introduced. Refresh the constraint without changing any existing events.
ALTER TABLE company_calendar_events
  DROP CONSTRAINT IF EXISTS company_calendar_events_category_check;

ALTER TABLE company_calendar_events
  ADD CONSTRAINT company_calendar_events_category_check
  CHECK (category IN ('event', 'meeting', 'payday', 'shutdown', 'holiday'));
