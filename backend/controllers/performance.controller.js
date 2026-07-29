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
