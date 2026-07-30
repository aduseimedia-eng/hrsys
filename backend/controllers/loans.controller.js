const db = require('../config/db');

exports.getAll = async (req, res) => {
  try {
    const isHr = ['admin', 'manager'].includes(req.user.role);
    const { rows } = await db.query(
      `SELECT l.*, CONCAT(e.first_name,' ',e.last_name) AS employee_name, e.employee_code
       FROM employee_loans l JOIN employees e ON e.id=l.employee_id
       WHERE l.company_id=$1 ${isHr ? '' : 'AND l.employee_id=$2'} ORDER BY l.status='active' DESC, l.created_at DESC`,
      isHr ? [req.user.company_id] : [req.user.company_id, req.user.id]
    );
    res.json(rows);
  } catch { res.status(500).json({ error: 'Could not fetch loans' }); }
};

exports.create = async (req, res) => {
  try {
    const employeeId = Number(req.body.employee_id), principal = Number(req.body.principal_amount), repayment = Number(req.body.monthly_repayment);
    const startDate = String(req.body.start_date || '');
    if (![employeeId, principal, repayment].every(Number.isFinite) || principal <= 0 || repayment <= 0 || !startDate) return res.status(400).json({ error: 'Employee, loan amount, monthly repayment and start date are required' });
    const owner = await db.query('SELECT id FROM employees WHERE id=$1 AND company_id=$2 AND is_active=true', [employeeId, req.user.company_id]);
    if (!owner.rows.length) return res.status(404).json({ error: 'Employee not found' });
    const { rows } = await db.query(
      `INSERT INTO employee_loans (company_id,employee_id,principal_amount,remaining_balance,monthly_repayment,start_date,reason,approved_by)
       VALUES ($1,$2,$3,$3,$4,$5,$6,$7) RETURNING *`,
      [req.user.company_id, employeeId, principal, repayment, startDate, String(req.body.reason || '').trim() || null, req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch { res.status(500).json({ error: 'Could not create loan' }); }
};

exports.cancel = async (req, res) => {
  try {
    const { rows } = await db.query("UPDATE employee_loans SET status='cancelled' WHERE id=$1 AND company_id=$2 AND status='active' RETURNING *", [req.params.id, req.user.company_id]);
    if (!rows.length) return res.status(404).json({ error: 'Active loan not found' });
    res.json(rows[0]);
  } catch { res.status(500).json({ error: 'Could not cancel loan' }); }
};
