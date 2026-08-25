// controllers/payroll.controller.js
const db = require('../config/db');
const { calculateMonthlyPayroll } = require('../config/ghana-payroll');
const { currencyFractionDigits, normalizeCurrency } = require('../config/currencies');
const { notifyEmployee } = require('../services/push.service');

// Admin: configuration required before versioned payroll runs are introduced.
exports.getGlobalSetup = async (req, res) => {
  try {
    const [countries, legalEntities, payGroups, profileCoverage] = await Promise.all([
      db.query(`SELECT iso_code, name, currency_code, currency_symbol, default_timezone, default_locale
                FROM countries WHERE active=true ORDER BY name`),
      db.query(`SELECT le.id, le.name, le.registration_number, le.tax_identifier, le.currency_code,
                       le.timezone, le.active, c.iso_code AS country_code, c.name AS country_name
                FROM legal_entities le JOIN countries c ON c.id=le.country_id
                WHERE le.company_id=$1 ORDER BY le.name`, [req.user.company_id]),
      db.query(`SELECT pg.id, pg.legal_entity_id, pg.name, pg.currency_code, pg.pay_frequency,
                       pg.pay_day, pg.active, c.iso_code AS country_code
                FROM pay_groups pg JOIN countries c ON c.id=pg.country_id
                WHERE pg.company_id=$1 ORDER BY pg.name`, [req.user.company_id]),
      db.query(`SELECT COUNT(*)::int AS active_profiles,
                       COUNT(*) FILTER (WHERE pay_group_id IS NULL)::int AS profiles_without_pay_group
                FROM employee_payroll_profiles
                WHERE company_id=$1 AND payroll_status='active'
                  AND effective_from <= CURRENT_DATE
                  AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)`, [req.user.company_id])
    ]);
    res.json({
      countries: countries.rows,
      legal_entities: legalEntities.rows,
      pay_groups: payGroups.rows,
      profile_coverage: profileCoverage.rows[0] || { active_profiles: 0, profiles_without_pay_group: 0 }
    });
  } catch (error) {
    if (error.code === '42P01') {
      return res.status(503).json({ error: 'Global payroll setup is not ready. Run database migrations first.' });
    }
    console.error(error);
    res.status(500).json({ error: 'Could not fetch global payroll setup' });
  }
};

// ─── Get my payslips ──────────────────────────────────────────
exports.getMine = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM payroll WHERE company_id=$1 AND employee_id=$2 ORDER BY year DESC, month DESC`,
      [req.user.company_id, req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch payslips' });
  }
};

// ─── Get single payslip ───────────────────────────────────────
exports.getPayslip = async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await db.query(
      `SELECT p.*, e.first_name, e.last_name, e.email, e.job_title, e.photo_url, e.role, e.employment_type,
              d.name AS department_name
       FROM payroll p
       JOIN employees e        ON e.id = p.employee_id
       LEFT JOIN departments d ON d.id = e.department_id
       WHERE p.id = $1 AND p.company_id = $2`,
      [id, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Payslip not found' });

    const slip = rows[0];
    // Employees can only view their own
    if (req.user.role === 'employee' && slip.employee_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    res.json(slip);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch payslip' });
  }
};

// ─── Admin: All payroll ───────────────────────────────────────
exports.getAll = async (req, res) => {
  try {
    const { month, year, status, department_id, employee_id } = req.query;
    const params = [req.user.company_id];
    let where = 'WHERE p.company_id = $1';

    if (month)         { params.push(month);         where += ` AND p.month = $${params.length}`; }
    if (year)          { params.push(year);          where += ` AND p.year = $${params.length}`; }
    if (status)        { params.push(status);        where += ` AND p.status = $${params.length}`; }
    if (department_id) { params.push(department_id); where += ` AND e.department_id = $${params.length}`; }
    if (employee_id)   { params.push(employee_id);   where += ` AND p.employee_id = $${params.length}`; }

    const { rows } = await db.query(
      `SELECT p.*, CONCAT(e.first_name,' ',e.last_name) AS employee_name,
              e.job_title, e.photo_url, e.role, e.employment_type, d.name AS department_name
       FROM payroll p
       JOIN employees e        ON e.id = p.employee_id
       LEFT JOIN departments d ON d.id = e.department_id
       ${where}
       ORDER BY p.year DESC, p.month DESC, e.first_name`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch payroll' });
  }
};

// ─── Process payroll for a month (generate from salaries) ────
exports.processMonth = async (req, res) => {
  const { month, year } = req.body;
  if (!month || !year) return res.status(400).json({ error: 'Month and year required' });

  let client;
  const processedEmployeeIds = [];
  try {
    client = await db.getClient();
    await client.query('BEGIN');

    const { rows: companyRows } = await client.query(
      'SELECT currency FROM companies WHERE id=$1 FOR UPDATE',
      [req.user.company_id]
    );
    const currency = normalizeCurrency(companyRows[0]?.currency);
    if (!currency) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Select a valid company base currency in Settings before processing payroll' });
    }
    const fractionDigits = currencyFractionDigits(currency);
    const configuredAllowanceRate = Number.parseFloat(process.env.ALLOWANCE_RATE || '0.05');
    const allowanceRate = Number.isFinite(configuredAllowanceRate) && configuredAllowanceRate >= 0
      ? configuredAllowanceRate
      : 0.05;

    // Keep every loan used by this payroll stable until its matching balance
    // update commits, so the snapshot and repayment always reconcile.
    await client.query(
      `SELECT id FROM employee_loans
       WHERE company_id=$1 AND status='active'
         AND start_date <= make_date($3::int, $2::int, 1)
       FOR UPDATE`,
      [req.user.company_id, month, year]
    );

    // Get all active employees not yet in payroll for this period
    const { rows: emps } = await client.query(
      `SELECT e.id, e.salary, e.employment_type,
              ROUND(e.salary * $4::numeric, $5::int) AS allowances,
              COALESCE(ot.overtime_hours, 0) AS overtime_hours,
              ROUND(COALESCE(ot.overtime_hours, 0) * COALESCE(os.hourly_rate, 0), $5::int) AS overtime_pay,
              COALESCE(benefits.employee_cost, 0) AS benefit_deductions,
              COALESCE(loans.repayment, 0) AS loan_deductions
       FROM employees e
       LEFT JOIN company_overtime_settings os ON os.company_id=e.company_id
       LEFT JOIN LATERAL (
         SELECT SUM(overtime_hours) AS overtime_hours
         FROM overtime_requests o
         WHERE o.company_id=e.company_id AND o.employee_id=e.id AND o.status='approved'
           AND EXTRACT(MONTH FROM o.work_date)=$1 AND EXTRACT(YEAR FROM o.work_date)=$2
       ) ot ON true
       LEFT JOIN LATERAL (
         SELECT SUM(b.employee_cost) AS employee_cost
         FROM benefits b
         WHERE b.company_id=e.company_id AND b.is_active=true
           AND b.eligible_employment_type IN ('all', e.employment_type)
       ) benefits ON true
       LEFT JOIN LATERAL (
         SELECT SUM(LEAST(l.monthly_repayment, l.remaining_balance)) AS repayment
         FROM employee_loans l
         WHERE l.company_id=e.company_id AND l.employee_id=e.id AND l.status='active'
           AND l.start_date <= make_date($2::int, $1::int, 1)
       ) loans ON true
       WHERE e.company_id = $3
         AND e.is_active = true
         AND NOT EXISTS (
           SELECT 1 FROM payroll p WHERE p.employee_id = e.id AND p.month=$1 AND p.year=$2
         )`,
      [month, year, req.user.company_id, allowanceRate, fractionDigits]
    );

    if (!emps.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Payroll already processed for this period' });
    }

    for (const emp of emps) {
      const allowances = emp.allowances || '0';
      const overtimeHours = Number(emp.overtime_hours || 0);
      const overtimePay = emp.overtime_pay || '0';
      const benefitDeductions = emp.benefit_deductions || '0';
      const loanDeductions = emp.loan_deductions || '0';
      // Currency controls numeric precision only; statutory rules remain the
      // explicitly Ghana-specific rules in config/ghana-payroll.js.
      const compliance = calculateMonthlyPayroll({
        basicSalary: Number(emp.salary),
        allowances: Number(allowances),
        fractionDigits
      });
      await client.query(
        `INSERT INTO payroll (company_id, employee_id, month, year, base_salary, allowances, overtime_hours, overtime_pay, tax, ssnit_employee, ssnit_employer, pensionable_earnings, pension_tier1, pension_tier2, other_deductions, benefit_deductions, loan_deductions, deductions, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::numeric + $16::numeric + $17::numeric,'processed')`,
        [req.user.company_id, emp.id, month, year, emp.salary, allowances, overtimeHours, overtimePay, compliance.payeTax, compliance.ssnitEmployee, compliance.ssnitEmployer, compliance.pensionableEarnings, compliance.pensionTier1, compliance.pensionTier2, compliance.otherDeductions, benefitDeductions, loanDeductions, compliance.deductions]
      );
      if (Number(loanDeductions) > 0) {
        await client.query(
          `UPDATE employee_loans SET remaining_balance=GREATEST(0, remaining_balance-LEAST(monthly_repayment, remaining_balance)),
             status=CASE WHEN remaining_balance-LEAST(monthly_repayment, remaining_balance) <= 0 THEN 'paid' ELSE 'active' END
           WHERE company_id=$1 AND employee_id=$2 AND status='active' AND start_date <= make_date($4::int, $3::int, 1)`,
          [req.user.company_id, emp.id, month, year]
        );
      }
      processedEmployeeIds.push(emp.id);
    }
    await client.query('COMMIT');
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error(err);
    return res.status(500).json({ error: 'Could not process payroll' });
  } finally {
    if (client) client.release();
  }

  // Notifications are intentionally outside the financial transaction. A push
  // delivery problem must not roll back or misreport an already committed payroll.
  for (const employeeId of processedEmployeeIds) {
    await notifyEmployee({
      companyId: req.user.company_id,
      employeeId,
      type: 'payroll',
      message: 'Your payroll for this month has been processed. View your payslip.'
    }).catch((error) => console.error('Payroll notification failed:', error.message));
  }
  res.json({ message: `Payroll processed for ${processedEmployeeIds.length} employees`, count: processedEmployeeIds.length });
};

// ─── Mark as paid ─────────────────────────────────────────────
exports.markPaid = async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await db.query(
      "UPDATE payroll SET status='paid', paid_at=NOW() WHERE id=$1 AND company_id=$2 RETURNING *",
      [id, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Payroll record not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Could not update payroll status' });
  }
};

// Admin: set payroll amounts/status for a staff member
exports.updatePayroll = async (req, res) => {
  try {
    const { id } = req.params;
    const baseSalary = Number(req.body.base_salary);
    const allowances = Number(req.body.allowances);
    const tax = Number(req.body.tax);
    const otherDeductions = Number(req.body.other_deductions);
    const status = req.body.status || 'processed';

    if (!['pending', 'processed', 'paid'].includes(status) || [baseSalary, allowances, tax, otherDeductions].some(value => !Number.isFinite(value) || value < 0)) {
      return res.status(400).json({ error: 'Enter valid non-negative payroll amounts and status' });
    }
    const deductions = tax + otherDeductions;

    const { rows } = await db.query(
      `UPDATE payroll
       SET base_salary=$1,
           allowances=$2,
           tax=$3,
           other_deductions=$4,
           deductions=$5 + ssnit_employee + benefit_deductions + loan_deductions,
           status=$6,
           paid_at=CASE WHEN $6='paid' THEN COALESCE(paid_at, NOW()) ELSE NULL END
       WHERE id=$7 AND company_id=$8
       RETURNING *`,
      [baseSalary, allowances, tax, otherDeductions, deductions, status, id, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Payroll record not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not update payroll' });
  }
};

// ─── Payroll summary ──────────────────────────────────────────
exports.getSummary = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT year, month,
              SUM(net_salary) AS total_net,
              SUM(base_salary) AS total_base,
              SUM(base_salary + allowances + overtime_pay) AS total_gross,
              SUM(deductions) AS total_deductions,
              COUNT(*) AS employee_count,
              COUNT(*) FILTER (WHERE status='paid') AS paid_count
       FROM payroll
       WHERE company_id=$1
       GROUP BY year, month
       ORDER BY year DESC, month DESC
       LIMIT 12`,
      [req.user.company_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch summary' });
  }
};
