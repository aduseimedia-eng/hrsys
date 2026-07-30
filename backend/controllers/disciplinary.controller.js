const db = require('../config/db');

const statuses = ['open', 'under_review', 'resolved', 'closed'];
const select = `SELECT d.*, CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
  e.employee_code, e.job_title, CONCAT(r.first_name, ' ', r.last_name) AS recorded_by_name
  FROM employee_disciplinary_cases d
  JOIN employees e ON e.id=d.employee_id
  LEFT JOIN employees r ON r.id=d.recorded_by`;

function values(body) {
  return [
    body.case_date,
    String(body.category || '').trim(),
    String(body.incident_summary || '').trim(),
    String(body.action_taken || '').trim(),
    String(body.status || 'open'),
    body.follow_up_date || null,
    String(body.outcome_notes || '').trim() || null
  ];
}

function valid(body) {
  const [, category, summary, action, status] = values(body);
  if (!body.case_date || !category || !summary || !action) return 'Employee, case date, category, incident summary, and action taken are required';
  if (!statuses.includes(status)) return 'Invalid disciplinary case status';
  return null;
}

exports.list = async (req, res) => {
  try {
    const { rows } = await db.query(`${select} WHERE d.company_id=$1 ORDER BY CASE d.status WHEN 'open' THEN 0 WHEN 'under_review' THEN 1 ELSE 2 END, d.case_date DESC, d.created_at DESC`, [req.user.company_id]);
    res.json(rows);
  } catch { res.status(500).json({ error: 'Could not fetch disciplinary register' }); }
};

exports.create = async (req, res) => {
  try {
    if (!req.body.employee_id) return res.status(400).json({ error: 'Select an employee' });
    const error = valid(req.body);
    if (error) return res.status(400).json({ error });
    const employee = await db.query('SELECT id FROM employees WHERE id=$1 AND company_id=$2', [req.body.employee_id, req.user.company_id]);
    if (!employee.rows.length) return res.status(404).json({ error: 'Employee not found' });
    const { rows } = await db.query(
      `INSERT INTO employee_disciplinary_cases(company_id,employee_id,case_date,category,incident_summary,action_taken,status,follow_up_date,outcome_notes,recorded_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.user.company_id, req.body.employee_id, ...values(req.body), req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Could not add disciplinary case' }); }
};

exports.update = async (req, res) => {
  try {
    const error = valid(req.body);
    if (error) return res.status(400).json({ error });
    const { rows } = await db.query(
      `UPDATE employee_disciplinary_cases SET case_date=$1,category=$2,incident_summary=$3,action_taken=$4,status=$5,follow_up_date=$6,outcome_notes=$7,updated_at=NOW()
       WHERE id=$8 AND company_id=$9 RETURNING *`,
      [...values(req.body), req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Disciplinary case not found' });
    res.json(rows[0]);
  } catch { res.status(500).json({ error: 'Could not update disciplinary case' }); }
};
