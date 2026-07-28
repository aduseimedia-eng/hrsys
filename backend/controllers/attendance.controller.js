// controllers/attendance.controller.js
const db = require('../config/db');

const ATTENDANCE_TIME_ZONE = process.env.ATTENDANCE_TIME_ZONE || 'Africa/Accra';

function formatExportDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: ATTENDANCE_TIME_ZONE, day: '2-digit', month: '2-digit', year: 'numeric'
  }).format(new Date(value));
}

function formatExportTime(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: ATTENDANCE_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).format(new Date(value));
}

function attendanceLocation(body) {
  const latitude = Number(body?.latitude);
  const longitude = Number(body?.longitude);
  const accuracy = Number(body?.accuracy_meters);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(accuracy)) {
    return { error: 'Location is required to record attendance. Please allow precise location and try again.' };
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 || accuracy < 0 || accuracy > 500) {
    return { error: 'Your location accuracy is too low. Move to an area with better GPS signal and try again.' };
  }
  return { latitude, longitude, accuracy };
}

// ─── Clock In ─────────────────────────────────────────────────
exports.clockIn = async (req, res) => {
  try {
    const location = attendanceLocation(req.body);
    if (location.error) return res.status(400).json({ error: location.error });
    const today = new Date().toISOString().split('T')[0];
    const clockInTime = new Date();

    const existing = await db.query(
      'SELECT id, clock_in FROM attendance WHERE company_id=$1 AND employee_id=$2 AND work_date=$3',
      [req.user.company_id, req.user.id, today]
    );
    if (existing.rows.length && existing.rows[0].clock_in) {
      return res.status(400).json({ error: 'Already clocked in today' });
    }

    if (existing.rows.length) {
      const { rows } = await db.query(
        `UPDATE attendance SET clock_in=$1, status=$2, clock_in_latitude=$3, clock_in_longitude=$4, clock_in_accuracy_meters=$5
         WHERE company_id=$6 AND employee_id=$7 AND work_date=$8 RETURNING *`,
        [clockInTime, 'present', location.latitude, location.longitude, location.accuracy, req.user.company_id, req.user.id, today]
      );
      return res.json(rows[0]);
    }

    const { rows } = await db.query(
      `INSERT INTO attendance (company_id, employee_id, work_date, clock_in, status, clock_in_latitude, clock_in_longitude, clock_in_accuracy_meters)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.company_id, req.user.id, today, clockInTime, 'present', location.latitude, location.longitude, location.accuracy]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Could not clock in' });
  }
};

// ─── Clock Out ────────────────────────────────────────────────
exports.clockOut = async (req, res) => {
  try {
    const location = attendanceLocation(req.body);
    if (location.error) return res.status(400).json({ error: location.error });
    const today = new Date().toISOString().split('T')[0];
    const { rows } = await db.query(
      'SELECT id, clock_in, clock_out FROM attendance WHERE company_id=$1 AND employee_id=$2 AND work_date=$3',
      [req.user.company_id, req.user.id, today]
    );

    if (!rows.length || !rows[0].clock_in) return res.status(400).json({ error: 'You have not clocked in today' });
    if (rows[0].clock_out) return res.status(400).json({ error: 'Already clocked out today' });

    const { rows: updated } = await db.query(
      `UPDATE attendance SET clock_out=$1, clock_out_latitude=$2, clock_out_longitude=$3, clock_out_accuracy_meters=$4
       WHERE company_id=$5 AND employee_id=$6 AND work_date=$7 RETURNING *`,
      [new Date(), location.latitude, location.longitude, location.accuracy, req.user.company_id, req.user.id, today]
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
      'SELECT * FROM attendance WHERE company_id=$1 AND employee_id=$2 AND work_date=$3',
      [req.user.company_id, req.user.id, today]
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
    const params = [req.user.company_id, req.user.id];
    let where = 'WHERE company_id = $1 AND employee_id = $2';

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
    const params = [req.user.company_id];
    let where = 'WHERE a.company_id = $1';

    if (date)          { params.push(date);          where += ` AND a.work_date = $${params.length}`; }
    if (status)        { params.push(status);        where += ` AND a.status = $${params.length}`; }
    if (department_id) { params.push(department_id); where += ` AND e.department_id = $${params.length}`; }

    params.push(limit, offset);
    const { rows } = await db.query(
      `SELECT a.*, CONCAT(e.first_name,' ',e.last_name) AS employee_name,
              e.job_title, e.photo_url, d.name AS department_name
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
exports.exportReport = async (req, res) => {
  try {
    const { date, department_id, status } = req.query;
    const params = [req.user.company_id];
    let where = 'WHERE a.company_id = $1';

    if (date)          { params.push(date);          where += ` AND a.work_date = $${params.length}`; }
    if (status)        { params.push(status);        where += ` AND a.status = $${params.length}`; }
    if (department_id) { params.push(department_id); where += ` AND e.department_id = $${params.length}`; }

    const { rows } = await db.query(
      `SELECT a.work_date, CONCAT(e.first_name,' ',e.last_name) AS employee_name,
              e.email, e.job_title, d.name AS department_name,
              a.clock_in, a.clock_out, a.status
       FROM attendance a
       JOIN employees e ON e.id = a.employee_id
       LEFT JOIN departments d ON d.id = e.department_id
       ${where}
       ORDER BY a.work_date DESC, e.first_name, e.last_name`,
      params
    );

    const columns = ['Date', 'Employee', 'Email', 'Job Title', 'Department', 'Clock In', 'Clock Out', 'Status'];
    const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const lines = [columns.map(csvCell).join(',')];
    rows.forEach((row) => lines.push([
      formatExportDate(row.work_date),
      row.employee_name, row.email, row.job_title, row.department_name,
      formatExportTime(row.clock_in), formatExportTime(row.clock_out), row.status
    ].map(csvCell).join(',')));

    const suffix = date || new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="kenadhr-attendance-${suffix}.csv"`);
    res.send(`\uFEFF${lines.join('\n')}`);
  } catch (err) {
    res.status(500).json({ error: 'Could not export attendance' });
  }
};

exports.getSummary = async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const [totals, lates] = await Promise.all([
      db.query(
        `SELECT status, COUNT(*) FROM attendance WHERE company_id=$1 AND work_date=$2 GROUP BY status`, [req.user.company_id, today]
      ),
      db.query(
        `SELECT e.id, CONCAT(e.first_name,' ',e.last_name) AS name, a.clock_in
         FROM attendance a JOIN employees e ON e.id=a.employee_id
         WHERE a.company_id=$1 AND a.work_date=$2 AND a.status='late' ORDER BY a.clock_in`, [req.user.company_id, today]
      )
    ]);

    const summary = {};
    totals.rows.forEach(r => { summary[r.status] = parseInt(r.count); });
    res.json({ summary, late_arrivals: lates.rows });
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch summary' });
  }
};
