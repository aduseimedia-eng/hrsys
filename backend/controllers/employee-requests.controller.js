const db = require('../config/db');

const TYPES = ['employment_letter', 'employment_confirmation', 'salary_advance', 'document', 'workplace', 'other'];
const STATUSES = ['pending', 'in_review', 'approved', 'declined', 'completed', 'cancelled'];
const select = `SELECT r.*, CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
  CONCAT(rv.first_name, ' ', rv.last_name) AS reviewer_name
  FROM employee_requests r
  JOIN employees e ON e.id=r.employee_id
  LEFT JOIN employees rv ON rv.id=r.reviewer_id`;

exports.list = async (req, res) => {
  try {
    const canManage = ['admin', 'manager'].includes(req.user.role);
    const params = [req.user.company_id];
    let where = 'WHERE r.company_id=$1';
    if (!canManage) { params.push(req.user.id); where += ` AND r.employee_id=$${params.length}`; }
    const { rows } = await db.query(`${select} ${where} ORDER BY r.created_at DESC`, params);
    res.json(rows);
  } catch (error) { console.error(error); res.status(500).json({ error: 'Could not fetch employee requests' }); }
};

exports.create = async (req, res) => {
  try {
    const requestType = String(req.body.request_type || '').trim();
    const subject = String(req.body.subject || '').trim();
    const details = String(req.body.details || '').trim();
    if (!TYPES.includes(requestType)) return res.status(400).json({ error: 'Select a valid request type' });
    if (!subject || subject.length > 180) return res.status(400).json({ error: 'Subject is required and must be 180 characters or fewer' });
    if (!details || details.length > 4000) return res.status(400).json({ error: 'Provide request details of 4,000 characters or fewer' });
    const { rows } = await db.query(
      `INSERT INTO employee_requests (company_id, employee_id, request_type, subject, details)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.user.company_id, req.user.id, requestType, subject, details]
    );
    res.status(201).json(rows[0]);
  } catch (error) { console.error(error); res.status(500).json({ error: 'Could not submit employee request' }); }
};

exports.update = async (req, res) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) return res.status(403).json({ error: 'Only HR can update employee requests' });
    const status = String(req.body.status || '').trim();
    const reviewerNote = String(req.body.reviewer_note || '').trim();
    if (!STATUSES.includes(status) || status === 'cancelled') return res.status(400).json({ error: 'Select a valid request status' });
    if (reviewerNote.length > 4000) return res.status(400).json({ error: 'Response must be 4,000 characters or fewer' });
    const { rows } = await db.query(
      `UPDATE employee_requests SET status=$1, reviewer_id=$2, reviewer_note=$3, reviewed_at=NOW(), updated_at=NOW()
       WHERE id=$4 AND company_id=$5 RETURNING *`,
      [status, req.user.id, reviewerNote || null, req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Employee request not found' });
    res.json(rows[0]);
  } catch (error) { console.error(error); res.status(500).json({ error: 'Could not update employee request' }); }
};
