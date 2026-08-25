const db = require('../config/db');
const { currencyFractionDigits } = require('../config/currencies');
const { calculatePayroll } = require('../services/payroll-engine');
const { getEffectiveRuleSet } = require('../services/payroll-rule-set.service');

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const transitions = {
  submit: { from: 'calculated', to: 'pending_approval', summary: 'Submitted payroll run for approval' },
  approve: { from: 'pending_approval', to: 'approved', summary: 'Approved payroll run' },
  finalize: { from: 'approved', to: 'finalized', summary: 'Finalized payroll run' },
  mark_paid: { from: 'finalized', to: 'paid', summary: 'Marked payroll run paid' }
};

exports.list = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT pr.*, pg.name AS pay_group_name, le.name AS legal_entity_name, c.iso_code AS country_code
       FROM payroll_runs pr
       JOIN legal_entities le ON le.id=pr.legal_entity_id
       LEFT JOIN pay_groups pg ON pg.id=pr.pay_group_id
       JOIN countries c ON c.id=pr.country_id
       WHERE pr.company_id=$1 ORDER BY pr.period_end DESC, pr.created_at DESC`,
      [req.user.company_id]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Could not fetch payroll runs' });
  }
};

exports.create = async (req, res) => {
  const { pay_group_id: payGroupId, period_start: periodStart, period_end: periodEnd, payment_date: paymentDate } = req.body;
  if (!payGroupId || !datePattern.test(periodStart || '') || !datePattern.test(periodEnd || '') || periodEnd < periodStart) {
    return res.status(400).json({ error: 'Provide a pay group and valid payroll period dates' });
  }
  if (paymentDate && !datePattern.test(paymentDate)) return res.status(400).json({ error: 'Provide a valid payment date' });

  try {
    const payGroup = await db.query(
      `SELECT pg.id, pg.legal_entity_id, pg.country_id, pg.currency_code
       FROM pay_groups pg JOIN legal_entities le ON le.id=pg.legal_entity_id
       WHERE pg.id=$1 AND pg.company_id=$2 AND pg.active=true AND le.active=true`,
      [payGroupId, req.user.company_id]
    );
    if (!payGroup.rows.length) return res.status(404).json({ error: 'Active pay group not found' });
    const group = payGroup.rows[0];
    const { rows } = await db.query(
      `INSERT INTO payroll_runs(company_id, legal_entity_id, pay_group_id, country_id, currency_code,
        period_start, period_end, payment_date, created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.user.company_id, group.legal_entity_id, group.id, group.country_id, group.currency_code,
        periodStart, periodEnd, paymentDate || null, req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'A payroll run already exists for this pay group and period' });
    console.error(error);
    res.status(500).json({ error: 'Could not create payroll run' });
  }
};

exports.calculate = async (req, res) => {
  let client;
  try {
    client = await db.getClient();
    await client.query('BEGIN');
    const runQuery = await client.query(
      `SELECT pr.*, c.iso_code AS country_code
       FROM payroll_runs pr JOIN countries c ON c.id=pr.country_id
       WHERE pr.id=$1 AND pr.company_id=$2 FOR UPDATE`,
      [req.params.id, req.user.company_id]
    );
    const run = runQuery.rows[0];
    if (!run) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Payroll run not found' }); }
    if (run.status !== 'draft') { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Only draft payroll runs can be calculated' }); }

    const profiles = await client.query(
      `SELECT e.id AS employee_id, e.salary, pp.pay_frequency
       FROM employee_payroll_profiles pp
       JOIN employees e ON e.id=pp.employee_id AND e.company_id=pp.company_id
       WHERE pp.company_id=$1 AND pp.pay_group_id=$2 AND pp.payroll_status='active'
         AND e.is_active=true AND pp.effective_from <= $3
         AND (pp.effective_to IS NULL OR pp.effective_to >= $3)
       ORDER BY e.id`,
      [req.user.company_id, run.pay_group_id, run.period_end]
    );
    if (!profiles.rows.length) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'No active payroll profiles are eligible for this run' }); }

    const rules = await getEffectiveRuleSet({ countryCode: run.country_code, effectiveDate: run.period_end, companyId: req.user.company_id, executor: client });
    const fractionDigits = currencyFractionDigits(run.currency_code);
    const ruleVersions = [...new Set(rules.map((rule) => rule.version))].join(',');
    for (const profile of profiles.rows) {
      const result = calculatePayroll({
        countryCode: run.country_code, basicSalary: profile.salary, rules, fractionDigits
      });
      const insertResult = await client.query(
        `INSERT INTO payroll_results(payroll_run_id, employee_id, currency_code, gross_pay, taxable_pay, pensionable_pay,
          employee_tax, employee_social_security, employee_pension, employee_other_deductions, employer_tax,
          employer_social_security, employer_pension, employer_other_contributions, total_employee_deductions,
          net_pay, total_employer_cost, status, calculation_version)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'calculated',$18) RETURNING id`,
        [run.id, profile.employee_id, run.currency_code, result.grossPay.toString(), result.taxablePay.toString(), result.pensionablePay.toString(),
          result.employeeTax.toString(), result.employeeSocialSecurity.toString(), result.employeePension.toString(), result.employeeOtherDeductions.toString(),
          result.employerTax.toString(), result.employerSocialSecurity.toString(), result.employerPension.toString(), result.employerOtherContributions.toString(),
          result.totalEmployeeDeductions.toString(), result.netPay.toString(), result.totalEmployerCost.toString(), 'global-engine-1.0']
      );
      for (const item of result.lineItems) {
        await client.query(
          `INSERT INTO payroll_line_items(payroll_result_id, type, code, name, amount, party, taxable, pensionable)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
          [insertResult.rows[0].id, item.type, item.code, item.name, item.amount.toString(), item.party, item.taxable, item.pensionable]
        );
      }
    }
    const updated = await client.query(
      `UPDATE payroll_runs SET status='calculated', rule_set_version=$1, calculation_engine_version='global-engine-1.0', updated_at=NOW()
       WHERE id=$2 RETURNING *`, [ruleVersions, run.id]
    );
    await client.query(
      `INSERT INTO audit_logs(company_id, actor_id, action, entity_type, entity_id, summary)
       VALUES($1,$2,'calculate','payroll_run',$3,$4)`,
      [req.user.company_id, req.user.id, run.id, `Calculated payroll for ${profiles.rows.length} employees`]
    );
    await client.query('COMMIT');
    res.json({ ...updated.rows[0], employee_count: profiles.rows.length });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error(error);
    res.status(500).json({ error: 'Could not calculate payroll run' });
  } finally {
    if (client) client.release();
  }
};

exports.transition = async (req, res) => {
  const transition = transitions[String(req.body.action || '').trim().toLowerCase()];
  if (!transition) return res.status(400).json({ error: 'Use submit, approve, finalize, or mark_paid' });

  try {
    const { rows } = await db.query(
      `UPDATE payroll_runs SET status=$1, approved_by=CASE WHEN $1='approved' THEN $2 ELSE approved_by END,
        approved_at=CASE WHEN $1='approved' THEN NOW() ELSE approved_at END,
        finalized_at=CASE WHEN $1='finalized' THEN NOW() ELSE finalized_at END, updated_at=NOW()
       WHERE id=$3 AND company_id=$4 AND status=$5 RETURNING *`,
      [transition.to, req.user.id, req.params.id, req.user.company_id, transition.from]
    );
    if (!rows.length) return res.status(409).json({ error: `Payroll run must be ${transition.from} before it can be ${transition.to}` });
    await db.query(
      `INSERT INTO audit_logs(company_id, actor_id, action, entity_type, entity_id, summary)
       VALUES($1,$2,'update','payroll_run',$3,$4)`,
      [req.user.company_id, req.user.id, rows[0].id, transition.summary]
    );
    res.json(rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Could not update payroll run status' });
  }
};
