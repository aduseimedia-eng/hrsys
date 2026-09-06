const { Decimal } = require('./payroll-engine/money');

const MAX_PAYE_BRACKETS = 50;
const MAX_STORED_AMOUNT = '999999999999999.9999';
const SUPPORTED_RULE_CODES = new Set(['GH-SSNIT', 'GH-PAYE']);

class PayrollRuleValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PayrollRuleValidationError';
  }
}

function canonicalDate(value, { optional = false, label = 'Effective date' } = {}) {
  const text = String(value ?? '').trim();
  if (!text && optional) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || text.startsWith('0000-')) {
    throw new PayrollRuleValidationError(`${label} must be a real date in YYYY-MM-DD format`);
  }
  const parsed = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
    throw new PayrollRuleValidationError(`${label} must be a real date in YYYY-MM-DD format`);
  }
  return text;
}

function decimalValue(value, label, { allowZero = true, maximum = null, scale = null } = {}) {
  const text = String(value ?? '').trim();
  if (!text) throw new PayrollRuleValidationError(`${label} is required`);
  const match = text.match(/^[+-]?(?:\d+(?:\.(\d+))?|\.(\d+))$/);
  if (!match || text.length > 100) {
    throw new PayrollRuleValidationError(`${label} must be a valid base-10 number`);
  }
  const decimalPlaces = (match[1] ?? match[2] ?? '').length;
  if (scale != null && decimalPlaces > scale) {
    throw new PayrollRuleValidationError(`${label} supports at most ${scale} decimal places`);
  }
  let amount;
  try {
    amount = new Decimal(text);
  } catch (_) {
    throw new PayrollRuleValidationError(`${label} must be a valid number`);
  }
  if (!amount.isFinite() || amount.isNegative() || (!allowZero && amount.isZero())) {
    throw new PayrollRuleValidationError(`${label} must be ${allowZero ? 'zero or greater' : 'greater than zero'}`);
  }
  if (maximum != null && amount.greaterThan(maximum)) {
    throw new PayrollRuleValidationError(`${label} must not exceed ${maximum}`);
  }
  return amount;
}

function validateDateRange(body = {}) {
  const effectiveFrom = canonicalDate(body.effective_from, { label: 'Effective from' });
  const effectiveTo = canonicalDate(body.effective_to, { optional: true, label: 'Effective to' });
  if (effectiveTo && effectiveTo < effectiveFrom) {
    throw new PayrollRuleValidationError('Effective to must be on or after effective from');
  }
  return { effectiveFrom, effectiveTo };
}

function validateSsnitSettings(body = {}) {
  const employeeRate = decimalValue(body.employee_rate, 'Employee SSNIT rate', { allowZero: false, maximum: 1, scale: 8 });
  const employerRate = decimalValue(body.employer_rate, 'Employer SSNIT rate', { allowZero: false, maximum: 1, scale: 8 });
  const maximumAmount = decimalValue(body.maximum_amount, 'Monthly SSNIT ceiling', {
    allowZero: false,
    maximum: MAX_STORED_AMOUNT,
    scale: 4
  });
  return {
    employeeRate: employeeRate.toString(),
    employerRate: employerRate.toString(),
    maximumAmount: maximumAmount.toString(),
    taxBrackets: []
  };
}

function validatePayeBrackets(value) {
  if (!Array.isArray(value) || !value.length) {
    throw new PayrollRuleValidationError('PAYE requires at least one tax bracket');
  }
  if (value.length > MAX_PAYE_BRACKETS) {
    throw new PayrollRuleValidationError(`PAYE supports at most ${MAX_PAYE_BRACKETS} tax brackets`);
  }

  const brackets = value.map((bracket, index) => {
    if (!bracket || typeof bracket !== 'object' || Array.isArray(bracket)) {
      throw new PayrollRuleValidationError(`PAYE bracket ${index + 1} must be an object`);
    }
    const lower = decimalValue(bracket.lower_bound, `PAYE bracket ${index + 1} lower bound`, {
      maximum: MAX_STORED_AMOUNT,
      scale: 4
    });
    const upperText = String(bracket.upper_bound ?? '').trim();
    const upper = upperText ? decimalValue(upperText, `PAYE bracket ${index + 1} upper bound`, {
      maximum: MAX_STORED_AMOUNT,
      scale: 4
    }) : null;
    const rate = decimalValue(bracket.rate, `PAYE bracket ${index + 1} rate`, { maximum: 1, scale: 8 });
    if (upper && !upper.greaterThan(lower)) {
      throw new PayrollRuleValidationError(`PAYE bracket ${index + 1} upper bound must be greater than its lower bound`);
    }
    if (upper === null && index !== value.length - 1) {
      throw new PayrollRuleValidationError('Only the final PAYE bracket may have no upper bound');
    }
    if (upper !== null && index === value.length - 1) {
      throw new PayrollRuleValidationError('The final PAYE bracket must have no upper bound');
    }
    return {
      lower_bound: lower.toString(),
      upper_bound: upper?.toString() ?? null,
      rate: rate.toString(),
      fixed_amount: '0'
    };
  });

  if (!new Decimal(brackets[0].lower_bound).isZero()) {
    throw new PayrollRuleValidationError('The first PAYE bracket must start at zero');
  }
  for (let index = 1; index < brackets.length; index += 1) {
    const previousUpper = brackets[index - 1].upper_bound;
    if (previousUpper === null || !new Decimal(brackets[index].lower_bound).equals(previousUpper)) {
      throw new PayrollRuleValidationError(`PAYE bracket ${index + 1} must start where bracket ${index} ends`);
    }
  }
  return brackets;
}

function validateRuleSettings(code, body = {}) {
  const normalizedCode = String(code || '').trim().toUpperCase();
  if (!SUPPORTED_RULE_CODES.has(normalizedCode)) {
    throw new PayrollRuleValidationError('Use a supported payroll rule code');
  }
  const { effectiveFrom, effectiveTo } = validateDateRange(body);
  const changeReason = String(body.change_reason ?? '').trim();
  if (!changeReason) throw new PayrollRuleValidationError('Change reason is required');
  if (changeReason.length > 1000) throw new PayrollRuleValidationError('Change reason must not exceed 1000 characters');
  const values = normalizedCode === 'GH-SSNIT'
    ? validateSsnitSettings(body)
    : { employeeRate: null, employerRate: null, maximumAmount: null, taxBrackets: validatePayeBrackets(body.tax_brackets) };
  return { code: normalizedCode, effectiveFrom, effectiveTo, changeReason, ...values };
}

function previousDate(value) {
  const date = new Date(`${canonicalDate(value)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function nextCompanyRuleVersion(code, companyId, effectiveFrom, history = []) {
  const baseVersion = `${code}-C${companyId}-${effectiveFrom}`;
  const usedVersions = new Set(history.map((row) => String(row?.version ?? row ?? '')).filter(Boolean));
  if (!usedVersions.has(baseVersion)) return baseVersion;

  let revision = 1;
  while (usedVersions.has(`${baseVersion}-R${revision}`)) revision += 1;
  return `${baseVersion}-R${revision}`;
}

function decorateRuleHistory(rows, asOfValue) {
  const asOf = canonicalDate(asOfValue, { label: 'As of' });
  const normalized = rows.map((row) => ({
    ...row,
    source: row.company_id == null ? 'global' : 'company',
    effective_from: canonicalDate(row.effective_from, { label: 'Rule effective from' }),
    effective_to: canonicalDate(row.effective_to, { optional: true, label: 'Rule effective to' })
  }));
  const currentIds = new Set();
  const codes = [...new Set(normalized.map((row) => row.code))];
  for (const code of codes) {
    const candidates = normalized
      .filter((row) => row.code === code && row.active !== false
        && row.effective_from <= asOf && (!row.effective_to || row.effective_to >= asOf))
      .sort((left, right) => {
        const sourceDifference = Number(right.source === 'company') - Number(left.source === 'company');
        if (sourceDifference) return sourceDifference;
        const dateDifference = right.effective_from.localeCompare(left.effective_from);
        if (dateDifference) return dateDifference;
        return Number(right.statutory_rule_version_id || right.id || 0) - Number(left.statutory_rule_version_id || left.id || 0);
      });
    if (candidates[0]) currentIds.add(String(candidates[0].statutory_rule_version_id ?? candidates[0].id));
  }

  return normalized.map((row) => {
    const id = String(row.statutory_rule_version_id ?? row.id);
    let status = 'superseded';
    if (row.active === false) status = 'inactive';
    else if (row.effective_from > asOf) status = 'scheduled';
    else if (row.effective_to && row.effective_to < asOf) status = 'expired';
    else if (currentIds.has(id)) status = 'current';
    return {
      ...row,
      status,
      is_current: status === 'current',
      is_scheduled: status === 'scheduled',
      is_expired: status === 'expired',
      is_company_override: row.source === 'company'
    };
  }).sort((left, right) => left.code.localeCompare(right.code)
    || Number(right.is_current) - Number(left.is_current)
    || Number(right.is_scheduled) - Number(left.is_scheduled)
    || Number(right.is_company_override) - Number(left.is_company_override)
    || right.effective_from.localeCompare(left.effective_from)
    || Number(right.statutory_rule_version_id || 0) - Number(left.statutory_rule_version_id || 0));
}

module.exports = {
  MAX_PAYE_BRACKETS,
  PayrollRuleValidationError,
  canonicalDate,
  decorateRuleHistory,
  nextCompanyRuleVersion,
  previousDate,
  validatePayeBrackets,
  validateRuleSettings
};
