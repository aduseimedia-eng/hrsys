// controllers/performance.controller.js
const db = require('../config/db');
const { notifyEmployee } = require('../services/push.service');

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
    if (!String(title || '').trim()) return res.status(400).json({ error: 'A review title is required' });
    if (!['supervisors', 'department_heads'].includes(target_type)) return res.status(400).json({ error: 'Choose supervisors or department heads' });
    if (closes_at && Number.isNaN(new Date(closes_at).getTime())) return res.status(400).json({ error: 'Choose a valid close date' });
    const { rows } = await db.query(
      `INSERT INTO performance_review_cycles (company_id, title, period, target_type, is_anonymous, closes_at, created_by_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.user.company_id, String(title).trim(), String(period || '').trim() || null, target_type, Boolean(is_anonymous), closes_at || null, req.user.id]
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
       LEFT JOIN performance_review_responses r ON r.cycle_id=c.id
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
       LEFT JOIN performance_review_responses r ON r.cycle_id=c.id AND r.reviewer_id=$2
       LEFT JOIN employees s ON s.id=r.subject_employee_id
       WHERE c.company_id=$1 AND c.is_open=true AND (c.closes_at IS NULL OR c.closes_at >= CURRENT_DATE)
       ORDER BY c.created_at DESC`, [req.user.company_id, req.user.id]
    );
    const employee = await db.query(
      `SELECT e.manager_id, e.department_id, d.manager_id AS department_head_id
       FROM employees e LEFT JOIN departments d ON d.id=e.department_id
       WHERE e.id=$1 AND e.company_id=$2 AND e.is_active=true`, [req.user.id, req.user.company_id]
    );
    if (!employee.rows.length) return res.json([]);
    const { manager_id, department_head_id } = employee.rows[0];
    res.json(rows.map((cycle) => {
      const subjectId = cycle.target_type === 'supervisors' ? manager_id : department_head_id;
      if (!subjectId || Number(subjectId) === req.user.id) return null;
      return { ...cycle, subject_employee_id: cycle.subject_employee_id || subjectId, subject_name: cycle.subject_name || null, subject_job_title: cycle.subject_job_title || null };
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
      `SELECT CASE WHEN $3='supervisors' THEN e.manager_id ELSE d.manager_id END AS subject_employee_id
       FROM employees e LEFT JOIN departments d ON d.id=e.department_id
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
       JOIN performance_review_cycles c ON c.id=r.cycle_id
       JOIN employees s ON s.id=r.subject_employee_id
       JOIN employees e ON e.id=r.reviewer_id
       WHERE r.cycle_id=$1 AND r.company_id=$2
       ORDER BY r.submitted_at DESC`, [req.params.id, req.user.company_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch feedback responses' });
  }
};
