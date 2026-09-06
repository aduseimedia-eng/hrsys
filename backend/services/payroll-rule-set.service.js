const db = require('../config/db');

// Loads immutable, effective-dated data for a run. The engine receives this
// snapshot as data and never queries the database or assumes a jurisdiction.
async function getEffectiveRuleSet({ countryCode, effectiveDate, companyId, executor = db }) {
  const { rows } = await executor.query(
    `SELECT sr.id AS statutory_rule_id, sr.code, sr.name, sr.category,
            srv.id AS statutory_rule_version_id, srv.company_id, srv.version,
            srv.calculation_type, srv.calculation_basis,
            srv.employee_rate, srv.employer_rate, srv.fixed_amount, srv.minimum_amount,
            srv.maximum_amount, srv.currency_code, srv.effective_from, srv.effective_to,
            CASE WHEN srv.company_id IS NULL THEN 'global' ELSE 'company' END AS source,
            brackets.tax_brackets
     FROM statutory_rules sr
     JOIN countries c ON c.id=sr.country_id
     JOIN LATERAL (
       SELECT candidate.*
       FROM statutory_rule_versions candidate
       WHERE candidate.statutory_rule_id=sr.id
         AND candidate.active=true
         AND candidate.effective_from <= $2
         AND (candidate.effective_to IS NULL OR candidate.effective_to >= $2)
         AND (candidate.company_id IS NULL OR candidate.company_id=$3)
       ORDER BY CASE WHEN candidate.company_id=$3 THEN 0 ELSE 1 END,
                candidate.effective_from DESC, candidate.id DESC
       LIMIT 1
     ) srv ON true
     JOIN LATERAL (
       SELECT COALESCE(json_agg(json_build_object('id', tb.id, 'lower_bound', tb.lower_bound,
         'upper_bound', tb.upper_bound, 'rate', tb.rate, 'fixed_amount', tb.fixed_amount)
         ORDER BY tb.lower_bound), '[]'::json) AS tax_brackets
       FROM tax_brackets tb
       WHERE tb.statutory_rule_version_id=srv.id
     ) brackets ON true
     WHERE c.iso_code=$1
     ORDER BY srv.priority, sr.code`,
    [String(countryCode || '').trim().toUpperCase(), effectiveDate, companyId]
  );
  if (!rows.length) throw new Error(`No effective payroll rules found for ${countryCode} on ${effectiveDate}`);
  return rows;
}

module.exports = { getEffectiveRuleSet };
