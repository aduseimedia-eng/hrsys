// controllers/performance.controller.js
const db = require('../config/db');
const { notifyEmployee } = require('../services/push.service');

const dateOnly = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? value : null;
};
const booleanValue = (value) => value === true || value === 1 || value === '1' || value === 'true';

exports.create = async (req, res) => {
  try {
    const { employee_id, rating, comments, period } = req.body;
    if (!employee_id || !rating) return res.status(400).json({ error: 'Employee and rating required' });
    if (rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating must be 1-5' });
    if (parseInt(employee_id, 10) === req.user.id) return res.status(400).json({ error: 'Cannot review yourself' });

    const employeeCheck = await db.query(
      'SELECT id FROM employees WHERE id=$1 AND company_id=$2 AND is_active=true',
      [employee_id, req.user.company_id]
    );
    if (!employeeCheck.rows.length) return res.status(404).json({ error: 'Employee not found' });

    const { rows } = await db.query(
      `INSERT INTO performance_reviews (company_id, employee_id, reviewer_id, rating, comments, period, review_date)
       VALUES ($1,$2,$3,$4,$5,$6,CURRENT_DATE) RETURNING *`,
      [req.user.company_id, employee_id, req.user.id, rating, comments, period]
    );

    await notifyEmployee({ companyId: req.user.company_id, employeeId: employee_id, type: 'review', message: `You have received a new performance review${period ? ' for ' + period : ''}.` });

    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Could not create review' });
  }
};

exports.getForEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    if (req.user.role === 'employee' && req.user.id !== parseInt(id, 10)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { rows } = await db.query(
      `SELECT pr.*, CONCAT(r.first_name,' ',r.last_name) AS reviewer_name, r.photo_url AS reviewer_photo
       FROM performance_reviews pr
       JOIN employees r ON r.id = pr.reviewer_id
       WHERE pr.company_id = $1 AND pr.employee_id = $2
       ORDER BY pr.review_date DESC`,
      [req.user.company_id, id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch reviews' });
  }
};

exports.getMine = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT pr.*, CONCAT(r.first_name,' ',r.last_name) AS reviewer_name, r.photo_url AS reviewer_photo
       FROM performance_reviews pr
       JOIN employees r ON r.id = pr.reviewer_id
       WHERE pr.company_id = $1 AND pr.employee_id = $2
       ORDER BY pr.review_date DESC`,
      [req.user.company_id, req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch your reviews' });
  }
};

exports.getAll = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT pr.*,
              CONCAT(e.first_name,' ',e.last_name) AS employee_name, e.photo_url,
              CONCAT(r.first_name,' ',r.last_name) AS reviewer_name,
              d.name AS department_name
       FROM performance_reviews pr
       JOIN employees e        ON e.id = pr.employee_id
       JOIN employees r        ON r.id = pr.reviewer_id
       LEFT JOIN departments d ON d.id = e.department_id
       WHERE pr.company_id = $1
       ORDER BY pr.review_date DESC`,
      [req.user.company_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch reviews' });
  }
};

exports.getTeamSummary = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT e.id, CONCAT(e.first_name,' ',e.last_name) AS name,
              e.photo_url, e.job_title, d.name AS department_name,
              ROUND(AVG(pr.rating),2) AS avg_rating,
              COUNT(pr.id) AS review_count,
              MAX(pr.review_date) AS last_reviewed
       FROM employees e
       LEFT JOIN performance_reviews pr ON pr.employee_id = e.id AND pr.company_id = e.company_id
       LEFT JOIN departments d ON d.id = e.department_id
       WHERE e.company_id = $1 AND e.is_active = true
       GROUP BY e.id, d.name
       ORDER BY avg_rating DESC NULLS LAST`,
      [req.user.company_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch team summary' });
  }
};

exports.createCycle = async (req, res) => {
  try {
    const { title, period = null, target_type, is_anonymous = false, closes_at = null } = req.body;
    const cleanTitle = String(title || '').trim();
    const cleanPeriod = String(period || '').trim();
    const closeDate = closes_at == null || closes_at === '' ? null : dateOnly(closes_at);
    if (!cleanTitle) return res.status(400).json({ error: 'A review title is required' });
    if (cleanTitle.length > 160 || cleanPeriod.length > 40) return res.status(400).json({ error: 'Review title or period is too long' });
    if (!['supervisors', 'department_heads'].includes(target_type)) return res.status(400).json({ error: 'Choose supervisors or department heads' });
    if (closes_at && !closeDate) return res.status(400).json({ error: 'Choose a valid close date' });
    if (closeDate && closeDate < new Date().toISOString().slice(0, 10)) return res.status(400).json({ error: 'Close date cannot be in the past' });
    const { rows } = await db.query(
      `INSERT INTO performance_review_cycles (company_id, title, period, target_type, is_anonymous, closes_at, created_by_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.user.company_id, cleanTitle, cleanPeriod || null, target_type, booleanValue(is_anonymous), closeDate, req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Could not open feedback review' });
  }
};

exports.listCycles = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT c.*, COUNT(r.id)::int AS response_count
       FROM performance_review_cycles c
       LEFT JOIN performance_review_responses r ON r.cycle_id=c.id AND r.company_id=c.company_id
       WHERE c.company_id=$1
       GROUP BY c.id
       ORDER BY c.is_open DESC, c.created_at DESC`, [req.user.company_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch feedback reviews' });
  }
};

exports.closeCycle = async (req, res) => {
  try {
    const { rows } = await db.query(
      `UPDATE performance_review_cycles SET is_open=false, updated_at=NOW()
       WHERE id=$1 AND company_id=$2 RETURNING *`, [req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Feedback review not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Could not close feedback review' });
  }
};

exports.getMyFeedbackCycles = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT c.*, r.id AS response_id, r.subject_employee_id,
              CONCAT(s.first_name,' ',s.last_name) AS subject_name, s.job_title AS subject_job_title
       FROM performance_review_cycles c
       LEFT JOIN performance_review_responses r ON r.cycle_id=c.id AND r.company_id=c.company_id AND r.reviewer_id=$2
       LEFT JOIN employees s ON s.id=r.subject_employee_id AND s.company_id=c.company_id
       WHERE c.company_id=$1 AND c.is_open=true AND (c.closes_at IS NULL OR c.closes_at >= CURRENT_DATE)
       ORDER BY c.created_at DESC`, [req.user.company_id, req.user.id]
    );
    const employee = await db.query(
      `SELECT m.id AS manager_id, m.first_name AS manager_first_name, m.last_name AS manager_last_name, m.job_title AS manager_job_title,
              h.id AS department_head_id, h.first_name AS department_head_first_name, h.last_name AS department_head_last_name, h.job_title AS department_head_job_title
       FROM employees e
       LEFT JOIN departments d ON d.id=e.department_id AND d.company_id=e.company_id
       LEFT JOIN employees m ON m.id=e.manager_id AND m.company_id=e.company_id AND m.is_active=true
       LEFT JOIN employees h ON h.id=d.manager_id AND h.company_id=e.company_id AND h.is_active=true
       WHERE e.id=$1 AND e.company_id=$2 AND e.is_active=true`, [req.user.id, req.user.company_id]
    );
    if (!employee.rows.length) return res.json([]);
    const employeeRow = employee.rows[0];
    res.json(rows.map((cycle) => {
      const manager = cycle.target_type === 'supervisors';
      const subjectId = manager ? employeeRow.manager_id : employeeRow.department_head_id;
      if (!subjectId || Number(subjectId) === req.user.id) return null;
      const subjectName = manager ? `${employeeRow.manager_first_name} ${employeeRow.manager_last_name}` : `${employeeRow.department_head_first_name} ${employeeRow.department_head_last_name}`;
      const subjectJobTitle = manager ? employeeRow.manager_job_title : employeeRow.department_head_job_title;
      return { ...cycle, subject_employee_id: cycle.subject_employee_id || subjectId, subject_name: cycle.subject_name || subjectName, subject_job_title: cycle.subject_job_title || subjectJobTitle || null };
    }).filter(Boolean));
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch open feedback reviews' });
  }
};

exports.submitFeedbackResponse = async (req, res) => {
  try {
    const { rating, comments = '' } = req.body;
    if (!Number.isInteger(Number(rating)) || Number(rating) < 1 || Number(rating) > 5) return res.status(400).json({ error: 'Rating must be 1-5' });
    const cycleResult = await db.query(
      `SELECT * FROM performance_review_cycles
       WHERE id=$1 AND company_id=$2 AND is_open=true AND (closes_at IS NULL OR closes_at >= CURRENT_DATE)`, [req.params.id, req.user.company_id]
    );
    if (!cycleResult.rows.length) return res.status(404).json({ error: 'This feedback review is closed or unavailable' });
    const targetResult = await db.query(
      `SELECT s.id AS subject_employee_id
       FROM employees e
       LEFT JOIN departments d ON d.id=e.department_id AND d.company_id=e.company_id
       LEFT JOIN employees s ON s.id=CASE WHEN $3='supervisors' THEN e.manager_id ELSE d.manager_id END
         AND s.company_id=e.company_id AND s.is_active=true
       WHERE e.id=$1 AND e.company_id=$2 AND e.is_active=true`, [req.user.id, req.user.company_id, cycleResult.rows[0].target_type]
    );
    const subjectId = targetResult.rows[0]?.subject_employee_id;
    if (!subjectId || Number(subjectId) === req.user.id) return res.status(400).json({ error: 'No eligible supervisor or department head is assigned to you' });
    const { rows } = await db.query(
      `INSERT INTO performance_review_responses (cycle_id, company_id, reviewer_id, subject_employee_id, rating, comments)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, cycle_id, subject_employee_id, rating, comments, submitted_at`,
      [req.params.id, req.user.company_id, req.user.id, subjectId, Number(rating), String(comments || '').trim() || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'You have already submitted feedback for this review' });
    res.status(500).json({ error: 'Could not submit feedback' });
  }
};

exports.getCycleResponses = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT r.id, r.subject_employee_id, r.rating, r.comments, r.submitted_at, c.is_anonymous,
              CONCAT(s.first_name,' ',s.last_name) AS subject_name,
              CASE WHEN c.is_anonymous THEN NULL ELSE CONCAT(e.first_name,' ',e.last_name) END AS reviewer_name
       FROM performance_review_responses r
       JOIN performance_review_cycles c ON c.id=r.cycle_id AND c.company_id=r.company_id
       JOIN employees s ON s.id=r.subject_employee_id AND s.company_id=r.company_id
       JOIN employees e ON e.id=r.reviewer_id AND e.company_id=r.company_id
       WHERE r.cycle_id=$1 AND r.company_id=$2
       ORDER BY r.submitted_at DESC`, [req.params.id, req.user.company_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch feedback responses' });
  }
};
