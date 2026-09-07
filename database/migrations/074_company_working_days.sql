LOCK TABLE work_schedules IN SHARE ROW EXCLUSIVE MODE;

UPDATE work_schedules
SET weekdays = ARRAY[1,2,3,4,5]::SMALLINT[]
WHERE array_ndims(weekdays) IS DISTINCT FROM 1
   OR cardinality(weekdays) NOT BETWEEN 1 AND 7
   OR NOT (weekdays <@ ARRAY[0,1,2,3,4,5,6]::SMALLINT[]);

WITH ranked_defaults AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY id DESC) AS position
  FROM work_schedules
  WHERE is_default=true
)
UPDATE work_schedules schedule
SET is_default=false
FROM ranked_defaults ranked
WHERE schedule.id=ranked.id AND ranked.position > 1;

ALTER TABLE work_schedules
  DROP CONSTRAINT IF EXISTS work_schedules_weekdays_valid;

ALTER TABLE work_schedules
  ADD CONSTRAINT work_schedules_weekdays_valid
  CHECK (array_ndims(weekdays) = 1
    AND cardinality(weekdays) BETWEEN 1 AND 7
    AND weekdays <@ ARRAY[0,1,2,3,4,5,6]::SMALLINT[]);

CREATE UNIQUE INDEX IF NOT EXISTS idx_work_schedules_one_default
  ON work_schedules(company_id)
  WHERE is_default;
