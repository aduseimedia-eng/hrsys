-- Make statutory settings auditable, range-safe, and large enough to snapshot
-- every rule version used by a payroll run.

ALTER TABLE payroll_runs
  ALTER COLUMN rule_set_version TYPE TEXT;

ALTER TABLE statutory_rule_versions
  ADD COLUMN IF NOT EXISTS created_by INT REFERENCES employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS change_reason TEXT;

-- Invalid values accepted by the legacy endpoint must not remain effective,
-- and would otherwise fail the new checks when a corrected successor tries
-- to close their date range. The country default remains the safe fallback.
UPDATE statutory_rule_versions versions
SET active=false,
    change_reason='Deactivated during migration: invalid legacy SSNIT settings',
    updated_at=NOW()
FROM statutory_rules rules
JOIN countries country ON country.id=rules.country_id
WHERE versions.statutory_rule_id=rules.id
  AND country.iso_code='GH'
  AND rules.code='GH-SSNIT'
  AND versions.company_id IS NOT NULL
  AND versions.active=true
  AND (
    versions.employee_rate IS NULL OR versions.employee_rate <= 0 OR versions.employee_rate > 1
    OR versions.employer_rate IS NULL OR versions.employer_rate <= 0 OR versions.employer_rate > 1
    OR versions.maximum_amount IS NULL OR versions.maximum_amount <= 0
  );

-- PAYE validity depends on the complete ordered bracket set, not only on
-- constraints for individual rows. Retire malformed legacy company versions
-- so the resolver falls back to the valid Ghana default until HR replaces them.
WITH gh_paye_company_versions AS (
  SELECT versions.id
  FROM statutory_rule_versions versions
  JOIN statutory_rules rules ON rules.id=versions.statutory_rule_id
  JOIN countries country ON country.id=rules.country_id
  WHERE country.iso_code='GH'
    AND rules.code='GH-PAYE'
    AND versions.company_id IS NOT NULL
    AND versions.active=true
), ordered_paye_brackets AS (
  SELECT versions.id AS version_id,
         brackets.id AS bracket_id,
         brackets.lower_bound,
         brackets.upper_bound,
         brackets.rate,
         brackets.fixed_amount,
         row_number() OVER (
           PARTITION BY versions.id
           ORDER BY brackets.lower_bound, brackets.id
         ) AS bracket_position,
         count(brackets.id) OVER (PARTITION BY versions.id) AS bracket_count,
         lag(brackets.upper_bound) OVER (
           PARTITION BY versions.id
           ORDER BY brackets.lower_bound, brackets.id
         ) AS previous_upper_bound
  FROM gh_paye_company_versions versions
  LEFT JOIN tax_brackets brackets ON brackets.statutory_rule_version_id=versions.id
), invalid_paye_versions AS (
  SELECT version_id
  FROM ordered_paye_brackets
  GROUP BY version_id
  HAVING count(bracket_id)=0
    OR min(lower_bound) FILTER (WHERE bracket_position=1) IS DISTINCT FROM 0::numeric
    OR count(*) FILTER (WHERE bracket_id IS NOT NULL AND upper_bound IS NULL) <> 1
    OR bool_or(
      bracket_id IS NOT NULL AND (
        lower_bound IS NULL OR lower_bound < 0
        OR rate IS NULL OR rate < 0 OR rate > 1
        OR fixed_amount IS NULL OR fixed_amount < 0
        OR (upper_bound IS NOT NULL AND upper_bound <= lower_bound)
        OR (bracket_position > 1 AND lower_bound IS DISTINCT FROM previous_upper_bound)
        OR (bracket_position < bracket_count AND upper_bound IS NULL)
        OR (bracket_position = bracket_count AND upper_bound IS NOT NULL)
      )
    )
)
UPDATE statutory_rule_versions versions
SET active=false,
    change_reason='Deactivated during migration: invalid legacy PAYE bracket settings',
    updated_at=NOW()
FROM invalid_paye_versions invalid
WHERE versions.id=invalid.version_id;

-- Existing company overrides were created as open-ended rows. Close each row
-- on the day before the next active override so future schedules begin from a
-- deterministic, non-overlapping history.
WITH duplicate_starts AS (
  SELECT id, row_number() OVER (
    PARTITION BY statutory_rule_id, company_id, effective_from
    ORDER BY id DESC
  ) AS position
  FROM statutory_rule_versions
  WHERE company_id IS NOT NULL AND active=true
)
UPDATE statutory_rule_versions versions
SET active=false, updated_at=NOW()
FROM duplicate_starts duplicates
WHERE versions.id=duplicates.id AND duplicates.position > 1;

WITH next_boundaries AS (
  SELECT current_version.id,
         (
           SELECT min(later.effective_from)
           FROM statutory_rule_versions later
           WHERE later.statutory_rule_id=current_version.statutory_rule_id
             AND later.company_id=current_version.company_id
             AND later.active=true
             AND later.effective_from > current_version.effective_from
         ) AS next_effective_from
  FROM statutory_rule_versions current_version
  WHERE current_version.company_id IS NOT NULL AND current_version.active=true
)
UPDATE statutory_rule_versions versions
SET effective_to=boundaries.next_effective_from - 1, updated_at=NOW()
FROM next_boundaries boundaries
WHERE versions.id=boundaries.id
  AND boundaries.next_effective_from IS NOT NULL
  AND (versions.effective_to IS NULL OR versions.effective_to >= boundaries.next_effective_from);

-- A two-key transaction advisory lock in the write path serializes schedules
-- for one rule and company. This index is the final guard against two active
-- versions being inserted with the same boundary outside that write path.
CREATE UNIQUE INDEX IF NOT EXISTS uq_rule_versions_company_effective_start
  ON statutory_rule_versions(statutory_rule_id, company_id, effective_from)
  WHERE company_id IS NOT NULL AND active=true;

UPDATE statutory_rule_versions
SET change_reason='Migrated legacy company override'
WHERE company_id IS NOT NULL AND (change_reason IS NULL OR length(trim(change_reason))=0);

ALTER TABLE statutory_rule_versions
  DROP CONSTRAINT IF EXISTS statutory_rule_versions_employee_rate_limit,
  ADD CONSTRAINT statutory_rule_versions_employee_rate_limit
    CHECK (employee_rate IS NULL OR (employee_rate > 0 AND employee_rate <= 1)) NOT VALID,
  DROP CONSTRAINT IF EXISTS statutory_rule_versions_employer_rate_limit,
  ADD CONSTRAINT statutory_rule_versions_employer_rate_limit
    CHECK (employer_rate IS NULL OR (employer_rate > 0 AND employer_rate <= 1)) NOT VALID,
  DROP CONSTRAINT IF EXISTS statutory_rule_versions_amounts_nonnegative,
  ADD CONSTRAINT statutory_rule_versions_amounts_nonnegative
    CHECK (
      (fixed_amount IS NULL OR fixed_amount >= 0)
      AND (minimum_amount IS NULL OR minimum_amount >= 0)
      AND (maximum_amount IS NULL OR maximum_amount > 0)
      AND (minimum_amount IS NULL OR maximum_amount IS NULL OR maximum_amount >= minimum_amount)
    ) NOT VALID,
  DROP CONSTRAINT IF EXISTS statutory_rule_versions_company_change_reason,
  ADD CONSTRAINT statutory_rule_versions_company_change_reason
    CHECK (
      company_id IS NULL OR
      (change_reason IS NOT NULL AND length(trim(change_reason)) BETWEEN 1 AND 1000)
    ) NOT VALID;

ALTER TABLE tax_brackets
  DROP CONSTRAINT IF EXISTS tax_brackets_rate_limit,
  ADD CONSTRAINT tax_brackets_rate_limit CHECK (rate BETWEEN 0 AND 1) NOT VALID,
  DROP CONSTRAINT IF EXISTS tax_brackets_positive_range,
  ADD CONSTRAINT tax_brackets_positive_range
    CHECK (upper_bound IS NULL OR upper_bound > lower_bound) NOT VALID,
  DROP CONSTRAINT IF EXISTS tax_brackets_fixed_amount_nonnegative,
  ADD CONSTRAINT tax_brackets_fixed_amount_nonnegative
    CHECK (fixed_amount >= 0) NOT VALID;

ALTER TABLE payroll_runs
  DROP CONSTRAINT IF EXISTS payroll_runs_rule_set_version_nonempty,
  ADD CONSTRAINT payroll_runs_rule_set_version_nonempty
    CHECK (rule_set_version IS NULL OR length(trim(rule_set_version)) > 0) NOT VALID;
