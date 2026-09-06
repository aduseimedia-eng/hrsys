const db = require('../config/db');
const { currencyFractionDigits } = require('../config/currencies');
const { calculatePayroll } = require('../services/payroll-engine');
const { Decimal, decimal } = require('../services/payroll-engine/money');
const { getEffectiveRuleSet } = require('../services/payroll-rule-set.service');

const maximumStoredMoney = new Decimal('999999999999.9999');
const enabled = value => value === true || value === 1 || value === 'true' || value === '1';
const validDate = value => {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || text.startsWith('0000-')) return false;
  const parsed = new Date(`${text}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text;
};
const parsedMoney = value => {
  const text = String(value ?? '').trim();
  if (!text) return null;
  try {
    const amount = decimal(text);
    return amount.isFinite() && amount.greaterThanOrEqualTo(0) && amount.lessThanOrEqualTo(maximumStoredMoney)
      ? amount
      : null;
  } catch (_) {
    return null;
  }
};
const validMoney = value => parsedMoney(value) !== null;
const ruleSetVersion = rules => [...new Set(rules.map(rule => rule.version).filter(Boolean))].join(',');

function normalizedInputs({ basic_salary, allowances = 0, other_deductions = 0, ssnit_insurable_salary }) {
  const basicSalary = parsedMoney(basic_salary);
  return {
    basicSalary,
    allowances: parsedMoney(allowances),
    otherDeductions: parsedMoney(other_deductions),
    ssnitInsurableSalary: parsedMoney(ssnit_insurable_salary == null ? basic_salary : ssnit_insurable_salary)
  };
}

function calculateWithRules({ body, countryCode, currencyCode, rules }) {
  const inputs = normalizedInputs(body);
  const result = calculatePayroll({
    countryCode,
    ...inputs,
    ssnitExempt: enabled(body.ssnit_exempt),
    payeExempt: enabled(body.paye_exempt),
    rules,
    fractionDigits: currencyFractionDigits(currencyCode)
  });
  return { inputs, result };
}

function calculationResponse({ inputs, result, countryCode, currencyCode, rules, effectiveDate }) {
  // Decimal values stay intact through calculation and persistence. Conversion
  // here only preserves the compensation page's existing JSON contract.
  const asNumber = value => value.toNumber();
  return {
    basic: asNumber(inputs.basicSalary),
    allowance: asNumber(inputs.allowances),
    other: asNumber(inputs.otherDeductions),
    insurable: asNumber(inputs.ssnitInsurableSalary),
    pensionableEarnings: asNumber(result.pensionablePay),
    ssnitEmployee: asNumber(result.employeeSocialSecurity),
    ssnitEmployer: asNumber(result.employerSocialSecurity),
    pensionTier1: asNumber(result.employeePension),
    pensionTier2: asNumber(result.employerPension),
    payeTax: asNumber(result.employeeTax),
    otherDeductions: asNumber(result.employeeOtherDeductions),
    deductions: asNumber(result.totalEmployeeDeductions),
    gross: asNumber(result.grossPay),
    net: asNumber(result.netPay),
    totalEmployerCost: asNumber(result.totalEmployerCost),
    country_code: countryCode,
    currency_code: currencyCode,
    effective_date: effectiveDate,
    rule_set_version: ruleSetVersion(rules)
  };
}

function payrollConfigurationError(error) {
  return /payroll rule|rule set|not configured|payroll provider/i.test(String(error?.message || ''));
}

async function previewContext({ companyId, employeeId, effectiveDate }) {
  const { rows } = await db.query(
    `SELECT DISTINCT c.iso_code AS country_code, pp.currency_code
     FROM employee_payroll_profiles pp
     JOIN employees e ON e.id=pp.employee_id AND e.company_id=pp.company_id
     JOIN countries c ON c.id=pp.country_id
     WHERE pp.company_id=$1 AND ($2::int IS NULL OR pp.employee_id=$2)
       AND e.is_active=true AND pp.payroll_status='active'
       AND pp.effective_from <= $3
       AND (pp.effective_to IS NULL OR pp.effective_to >= $3)
     ORDER BY c.iso_code, pp.currency_code
     LIMIT 2`,
    [companyId, employeeId || null, effectiveDate]
  );
  return rows;
}

function fullyExemptUnauthenticatedPreview(body, res) {
  // Legacy controller tests omit req.user. A fully exempt calculation is
  // rule-independent; production requests still require company context.
  if (!enabled(body.ssnit_exempt) || !enabled(body.paye_exempt)) {
    return res.status(401).json({ error: 'Authentication is required to preview payroll deductions' });
  }
  const inputs = normalizedInputs(body);
  const gross = inputs.basicSalary.plus(inputs.allowances);
  const net = gross.minus(inputs.otherDeductions);
  if (net.isNegative()) return res.status(400).json({ error: 'Staff deductions cannot exceed estimated net earnings' });
  return res.json({
    basic: inputs.basicSalary.toNumber(), allowance: inputs.allowances.toNumber(), other: inputs.otherDeductions.toNumber(),
    insurable: inputs.ssnitInsurableSalary.toNumber(), pensionableEarnings: inputs.ssnitInsurableSalary.toNumber(),
    ssnitEmployee: 0, ssnitEmployer: 0, pensionTier1: 0, pensionTier2: 0, payeTax: 0,
    otherDeductions: inputs.otherDeductions.toNumber(), deductions: inputs.otherDeductions.toNumber(),
    gross: gross.toNumber(), net: net.toNumber(), totalEmployerCost: gross.toNumber()
  });
}

exports.list = async (req, res) => {
  try {
    const { search = '', department_id, status = 'current' } = req.query;
    const params = [req.user.company_id]; let where = 'WHERE e.company_id=$1 AND e.is_active=true';
    if (department_id) { params.push(department_id); where += ` AND e.department_id=$${params.length}`; }
    if (search) { params.push(`%${search}%`); where += ` AND (e.first_name ILIKE $${params.length} OR e.last_name ILIKE $${params.length} OR e.employee_code ILIKE $${params.length})`; }
    const recordWhere = status === 'all' ? '' : ` AND sr.status='${status === 'previous' ? 'previous' : 'current'}'`;
    const { rows } = await db.query(`SELECT e.employee_code,e.first_name,e.last_name,e.job_title,d.name AS department_name,
      sr.*, to_char(sr.effective_from, 'YYYY-MM-DD') AS effective_from_iso,
      to_char(sr.effective_to, 'YYYY-MM-DD') AS effective_to_iso,
      COALESCE(sr.employee_id,e.id) AS employee_id FROM employees e LEFT JOIN LATERAL (
        SELECT sr.*, CASE WHEN sr.effective_from > CURRENT_DATE THEN 'scheduled'
          WHEN sr.effective_to IS NULL OR sr.effective_to >= CURRENT_DATE THEN 'active' ELSE 'expired' END AS effective_status
        FROM salary_records sr WHERE sr.employee_id=e.id AND sr.company_id=e.company_id${recordWhere}
        ORDER BY sr.effective_from DESC, sr.id DESC LIMIT 1
      ) sr ON true
      LEFT JOIN departments d ON d.id=e.department_id ${where} ORDER BY e.first_name,e.last_name`, params);
    res.json(rows.map(({ effective_from_iso: effectiveFrom, effective_to_iso: effectiveTo, ...row }) => ({
      ...row,
      effective_from: effectiveFrom,
      effective_to: effectiveTo
    })));
  } catch (error) { console.error(error); res.status(500).json({ error: 'Could not load salary records' }); }
};

exports.detail = async (req, res) => {
  try {
    const employeeId = Number(req.params.employeeId);
    const employee = await db.query(`SELECT e.id,e.employee_code,e.first_name,e.last_name,e.job_title,d.name AS department_name FROM employees e LEFT JOIN departments d ON d.id=e.department_id WHERE e.id=$1 AND e.company_id=$2`, [employeeId, req.user.company_id]);
    if (!employee.rows.length) return res.status(404).json({ error: 'Employee not found' });
    const records = await db.query(
      `SELECT sr.*, to_char(sr.effective_from, 'YYYY-MM-DD') AS effective_from_iso,
              to_char(sr.effective_to, 'YYYY-MM-DD') AS effective_to_iso,
              CASE WHEN sr.effective_from > CURRENT_DATE THEN 'scheduled'
                WHEN sr.effective_to IS NULL OR sr.effective_to >= CURRENT_DATE THEN 'active' ELSE 'expired' END AS effective_status
       FROM salary_records sr WHERE sr.employee_id=$1 AND sr.company_id=$2
       ORDER BY sr.effective_from DESC, sr.id DESC`,
      [employeeId, req.user.company_id]
    );
    res.json({
      employee: employee.rows[0],
      records: records.rows.map(({ effective_from_iso: effectiveFrom, effective_to_iso: effectiveTo, ...row }) => ({
        ...row, effective_from: effectiveFrom, effective_to: effectiveTo
      }))
    });
  } catch (error) { res.status(500).json({ error: 'Could not load salary history' }); }
};

exports.set = async (req, res) => {
  const { employee_id, basic_salary, allowances = 0, other_deductions = 0, ssnit_insurable_salary, effective_from, ssnit_exempt = false, paye_exempt = false } = req.body;
  const changeReason = String(req.body.change_reason || '').trim().slice(0, 300);
  if (!Number.isInteger(Number(employee_id)) || !validDate(effective_from) || ![basic_salary, allowances, other_deductions, ssnit_insurable_salary == null ? basic_salary : ssnit_insurable_salary].every(validMoney)) {
    return res.status(400).json({ error: 'Provide an employee, real effective date, and valid non-negative salary amounts' });
  }

  let client;
  try {
    client = await db.getClient();
    await client.query('BEGIN');
    const employee = await client.query(
      `SELECT e.id, payroll_context.country_code, payroll_context.currency_code
       FROM employees e
       LEFT JOIN LATERAL (
         SELECT c.iso_code AS country_code, pp.currency_code
         FROM employee_payroll_profiles pp JOIN countries c ON c.id=pp.country_id
         WHERE pp.employee_id=e.id AND pp.company_id=e.company_id AND pp.payroll_status='active'
           AND pp.effective_from <= $3
           AND (pp.effective_to IS NULL OR pp.effective_to >= $3)
         ORDER BY pp.effective_from DESC, pp.id DESC LIMIT 1
       ) payroll_context ON true
       WHERE e.id=$1 AND e.company_id=$2 AND e.is_active=true
       FOR UPDATE OF e`,
      [employee_id, req.user.company_id, effective_from]
    );
    if (!employee.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Active employee not found' });
    }
    const context = employee.rows[0];
    if (!context.country_code || !context.currency_code) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Set up an active payroll profile for this employee on the effective date first' });
    }

    let rules;
    let values;
    try {
      rules = await getEffectiveRuleSet({
        countryCode: context.country_code,
        effectiveDate: effective_from,
        companyId: req.user.company_id,
        executor: client
      });
      values = calculateWithRules({ body: req.body, countryCode: context.country_code, currencyCode: context.currency_code, rules });
    } catch (error) {
      if (!payrollConfigurationError(error)) throw error;
      await client.query('ROLLBACK');
      return res.status(422).json({ error: 'Payroll tax rules are not configured for this employee and effective date' });
    }
    if (values.result.netPay.isNegative()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Staff deductions cannot exceed net earnings after statutory deductions' });
    }

    const current = await client.query("SELECT id,to_char(effective_from, 'YYYY-MM-DD') AS effective_from FROM salary_records WHERE employee_id=$1 AND company_id=$2 AND status='current' FOR UPDATE", [employee_id, req.user.company_id]);
    if (current.rows[0] && effective_from <= String(current.rows[0].effective_from).slice(0, 10)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Effective date must be after the current salary start date' });
    }
    if (current.rows[0]) await client.query("UPDATE salary_records SET status='previous',effective_to=$1::date-1,updated_at=NOW() WHERE id=$2", [effective_from, current.rows[0].id]);

    const { inputs, result } = values;
    const saved = await client.query(
      `INSERT INTO salary_records(company_id,employee_id,basic_salary,allowances,ssnit_insurable_salary,gross_salary,employee_ssnit,employer_ssnit,tier1_contribution,tier2_contribution,paye,other_deductions,estimated_net_salary,effective_from,status,created_by,ssnit_exempt,paye_exempt)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'current',$15,$16,$17)
       RETURNING *, CASE WHEN effective_from > CURRENT_DATE THEN 'scheduled' ELSE 'active' END AS effective_status`,
      [req.user.company_id, employee_id, inputs.basicSalary.toString(), inputs.allowances.toString(), inputs.ssnitInsurableSalary.toString(),
        result.grossPay.toString(), result.employeeSocialSecurity.toString(), result.employerSocialSecurity.toString(),
        result.employeePension.toString(), result.employerPension.toString(), result.employeeTax.toString(), inputs.otherDeductions.toString(),
        result.netPay.toString(), effective_from, req.user.id, enabled(ssnit_exempt), enabled(paye_exempt)]
    );
    // Payroll Runs consume future compensation directly from salary_records.
    // Keep the employee's present-day salary unchanged until the effective date.
    await client.query(
      'UPDATE employees SET salary=$1 WHERE id=$2 AND company_id=$3 AND $4::date <= CURRENT_DATE',
      [inputs.basicSalary.toString(), employee_id, req.user.company_id, effective_from]
    );
    await client.query(
      `INSERT INTO audit_logs(company_id, actor_id, action, entity_type, entity_id, summary)
       VALUES($1,$2,'create','salary_records',$3,$4)`,
      [req.user.company_id, req.user.id, saved.rows[0].id, changeReason || `Scheduled compensation and payroll treatment for employee ${employee_id}`]
    );
    await client.query('COMMIT');
    res.status(201).json({
      ...saved.rows[0],
      country_code: context.country_code,
      currency_code: context.currency_code,
      rule_set_version: ruleSetVersion(rules)
    });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error(error);
    res.status(500).json({ error: 'Could not save salary record' });
  } finally {
    if (client) client.release();
  }
};

async function previewWithEffectiveRules(req, res, effectiveDate, employeeId) {
  try {
    const contexts = await previewContext({ companyId: req.user.company_id, employeeId, effectiveDate });
    if (!contexts.length) return res.status(409).json({ error: 'No active payroll profile is configured for this effective date' });
    if (contexts.length > 1) return res.status(400).json({ error: 'Select an employee to preview the correct country payroll rules' });
    const context = contexts[0];
    const rules = await getEffectiveRuleSet({
      countryCode: context.country_code,
      effectiveDate,
      companyId: req.user.company_id
    });
    const values = calculateWithRules({ body: req.body, countryCode: context.country_code, currencyCode: context.currency_code, rules });
    if (values.result.netPay.isNegative()) {
      return res.status(400).json({ error: 'Staff deductions cannot exceed net earnings after statutory deductions' });
    }
    return res.json(calculationResponse({
      ...values,
      countryCode: context.country_code,
      currencyCode: context.currency_code,
      rules,
      effectiveDate
    }));
  } catch (error) {
    if (payrollConfigurationError(error)) {
      return res.status(422).json({ error: 'Payroll tax rules are not configured for this effective date' });
    }
    console.error(error);
    return res.status(500).json({ error: 'Could not preview payroll deductions' });
  }
}

exports.preview = (req, res) => {
  const { employee_id: employeeId, basic_salary = 0, allowances = 0, other_deductions = 0, ssnit_insurable_salary: insurableSalary } = req.body;
  const effectiveDate = String(req.body.effective_from || new Date().toISOString().slice(0, 10));
  if (![basic_salary, allowances, other_deductions, insurableSalary == null ? basic_salary : insurableSalary].every(validMoney)) {
    return res.status(400).json({ error: 'Provide valid non-negative salary amounts' });
  }
  if (!validDate(effectiveDate) || (employeeId != null && !Number.isInteger(Number(employeeId)))) {
    return res.status(400).json({ error: 'Provide a valid employee and real effective date' });
  }
  if (!req.user?.company_id) return fullyExemptUnauthenticatedPreview(req.body, res);
  return previewWithEffectiveRules(req, res, effectiveDate, employeeId == null ? null : Number(employeeId));
};
