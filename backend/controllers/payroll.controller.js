// controllers/payroll.controller.js
const db = require('../config/db');
const { calculateMonthlyPayroll } = require('../config/ghana-payroll');
const { notifyEmployee } = require('../services/push.service');

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
  try {
    const { month, year } = req.body;
    if (!month || !year) return res.status(400).json({ error: 'Month and year required' });

    // Get all active employees not yet in payroll for this period
    const { rows: emps } = await db.query(
      `SELECT e.id, e.salary, e.employment_type,
              COALESCE(ot.overtime_hours, 0) AS overtime_hours,
              COALESCE(ot.overtime_hours, 0) * COALESCE(os.hourly_rate, 0) AS overtime_pay,
              COALESCE(benefits.employee_cost, 0) AS benefit_deductions
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
       WHERE e.company_id = $3
         AND e.is_active = true
         AND NOT EXISTS (
           SELECT 1 FROM payroll p WHERE p.employee_id = e.id AND p.month=$1 AND p.year=$2
         )`,
      [month, year, req.user.company_id]
    );

    if (!emps.length) return res.status(409).json({ error: 'Payroll already processed for this period' });

    const allowanceRate = parseFloat(process.env.ALLOWANCE_RATE || 0.05);

    for (const emp of emps) {
      const allowances = (emp.salary * allowanceRate).toFixed(2);
      const overtimeHours = Number(emp.overtime_hours || 0);
      const overtimePay = Number(emp.overtime_pay || 0).toFixed(2);
      const benefitDeductions = Number(emp.benefit_deductions || 0).toFixed(2);
      const compliance = calculateMonthlyPayroll({ basicSalary: Number(emp.salary) + Number(overtimePay), allowances });
      await db.query(
        `INSERT INTO payroll (company_id, employee_id, month, year, base_salary, allowances, overtime_hours, overtime_pay, tax, ssnit_employee, ssnit_employer, other_deductions, benefit_deductions, deductions, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'processed')`,
        [req.user.company_id, emp.id, month, year, emp.salary, allowances, overtimeHours, overtimePay, compliance.payeTax, compliance.ssnitEmployee, compliance.ssnitEmployer, compliance.otherDeductions, benefitDeductions, Number(compliance.deductions) + Number(benefitDeductions)]
      );
      // Notify employee
      await notifyEmployee({ companyId: req.user.company_id, employeeId: emp.id, type: 'payroll', message: 'Your payroll for this month has been processed. View your payslip.' });
    }

    res.json({ message: `Payroll processed for ${emps.length} employees`, count: emps.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not process payroll' });
  }
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
           deductions=$5 + ssnit_employee + benefit_deductions,
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
