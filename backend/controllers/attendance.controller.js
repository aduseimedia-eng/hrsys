// controllers/attendance.controller.js
const db = require('../config/db');

const LATE_THRESHOLD_HOUR = parseInt(process.env.LATE_THRESHOLD_HOUR) || 9;

// ─── Clock In ─────────────────────────────────────────────────
exports.clockIn = async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const clockInTime = new Date();
    const isLate = clockInTime.getHours() >= LATE_THRESHOLD_HOUR;

    const existing = await db.query(
      'SELECT id, clock_in FROM attendance WHERE employee_id=$1 AND work_date=$2',
      [req.user.id, today]
    );
    if (existing.rows.length && existing.rows[0].clock_in) {
      return res.status(400).json({ error: 'Already clocked in today' });
    }

    if (existing.rows.length) {
      const { rows } = await db.query(
        'UPDATE attendance SET clock_in=$1, status=$2 WHERE employee_id=$3 AND work_date=$4 RETURNING *',
        [clockInTime, isLate ? 'late' : 'present', req.user.id, today]
      );
      return res.json(rows[0]);
    }

    const { rows } = await db.query(
      'INSERT INTO attendance (employee_id, work_date, clock_in, status) VALUES ($1,$2,$3,$4) RETURNING *',
      [req.user.id, today, clockInTime, isLate ? 'late' : 'present']
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Could not clock in' });
  }
};

// ─── Clock Out ────────────────────────────────────────────────
exports.clockOut = async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { rows } = await db.query(
      'SELECT id, clock_in, clock_out FROM attendance WHERE employee_id=$1 AND work_date=$2',
      [req.user.id, today]
    );

    if (!rows.length || !rows[0].clock_in) return res.status(400).json({ error: 'You have not clocked in today' });
    if (rows[0].clock_out) return res.status(400).json({ error: 'Already clocked out today' });

    const { rows: updated } = await db.query(
      'UPDATE attendance SET clock_out=$1 WHERE employee_id=$2 AND work_date=$3 RETURNING *',
      [new Date(), req.user.id, today]
    );
    res.json(updated[0]);
  } catch (err) {
    res.status(500).json({ error: 'Could not clock out' });
  }
};

// ─── Get my attendance status today ──────────────────────────
exports.getToday = async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { rows } = await db.query(
      'SELECT * FROM attendance WHERE employee_id=$1 AND work_date=$2',
      [req.user.id, today]
    );
    res.json(rows[0] || { clocked_in: false });
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch attendance' });
  }
};

// ─── My attendance history ────────────────────────────────────
exports.getMyHistory = async (req, res) => {
  try {
    const { from, to, page = 1, limit = 30 } = req.query;
    const offset = (page - 1) * limit;
    const params = [req.user.id];
    let where = 'WHERE employee_id = $1';

    if (from) { params.push(from); where += ` AND work_date >= $${params.length}`; }
    if (to)   { params.push(to);   where += ` AND work_date <= $${params.length}`; }

    params.push(limit, offset);
    const { rows } = await db.query(
      `SELECT * FROM attendance ${where} ORDER BY work_date DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch history' });
  }
};

// ─── HR: All attendance report ────────────────────────────────
exports.getReport = async (req, res) => {
  try {
    const { date, department_id, status, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    const params = [];
    let where = 'WHERE 1=1';

    if (date)          { params.push(date);          where += ` AND a.work_date = $${params.length}`; }
    if (status)        { params.push(status);        where += ` AND a.status = $${params.length}`; }
    if (department_id) { params.push(department_id); where += ` AND e.department_id = $${params.length}`; }

    params.push(limit, offset);
    const { rows } = await db.query(
      `SELECT a.*, CONCAT(e.first_name,' ',e.last_name) AS employee_name,
              e.job_title, d.name AS department_name
       FROM attendance a
       JOIN employees e  ON e.id = a.employee_id
       LEFT JOIN departments d ON d.id = e.department_id
       ${where}
       ORDER BY a.work_date DESC, e.first_name
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch report' });
  }
};

// ─── Summary stats for HR ─────────────────────────────────────
exports.getSummary = async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const [totals, lates] = await Promise.all([
      db.query(
        `SELECT status, COUNT(*) FROM attendance WHERE work_date=$1 GROUP BY status`, [today]
      ),
      db.query(
        `SELECT e.id, CONCAT(e.first_name,' ',e.last_name) AS name, a.clock_in
         FROM attendance a JOIN employees e ON e.id=a.employee_id
         WHERE a.work_date=$1 AND a.status='late' ORDER BY a.clock_in`, [today]
      )
    ]);

    const summary = {};
    totals.rows.forEach(r => { summary[r.status] = parseInt(r.count); });
    res.json({ summary, late_arrivals: lates.rows });
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch summary' });
  }
};
