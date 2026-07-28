ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS clock_in_latitude NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS clock_in_longitude NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS clock_in_accuracy_meters NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS clock_out_latitude NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS clock_out_longitude NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS clock_out_accuracy_meters NUMERIC(8,2);
