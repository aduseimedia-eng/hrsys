ALTER TABLE company_overtime_settings
  ADD COLUMN IF NOT EXISTS late_clock_in_after TIME NOT NULL DEFAULT TIME '09:00';
