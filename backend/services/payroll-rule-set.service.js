const db = require('../config/db');

// Loads immutable, effective-dated data for a run. The engine receives this
// snapshot as data and never queries the database or assumes a jurisdiction.
async function getEffectiveRuleSet({ countryCode, effectiveDate }) {
  const { rows } = await db.query(
    `SELECT sr.code, sr.name, srv.version, srv.calculation_type, srv.calculation_basis,
            srv.employee_rate, srv.employer_rate, srv.fixed_amount, srv.minimum_amount,
            srv.maximum_amount, srv.currency_code,
            COALESCE(json_agg(json_build_object('lower_bound', tb.lower_bound, 'upper_bound', tb.upper_bound,
              'rate', tb.rate, 'fixed_amount', tb.fixed_amount) ORDER BY tb.lower_bound)
              FILTER (WHERE tb.id IS NOT NULL), '[]') AS tax_brackets
     FROM statutory_rules sr
     JOIN countries c ON c.id=sr.country_id
     JOIN statutory_rule_versions srv ON srv.statutory_rule_id=sr.id
       AND srv.active=true AND srv.effective_from <= $2
       AND (srv.effective_to IS NULL OR srv.effective_to >= $2)
     LEFT JOIN tax_brackets tb ON tb.statutory_rule_version_id=srv.id
     WHERE c.iso_code=$1
     GROUP BY sr.code, sr.name, srv.id
     ORDER BY srv.priority, sr.code`,
    [String(countryCode || '').toUpperCase(), effectiveDate]
  );
  if (!rows.length) throw new Error(`No effective payroll rules found for ${countryCode} on ${effectiveDate}`);
  return rows;
}

module.exports = { getEffectiveRuleSet };
