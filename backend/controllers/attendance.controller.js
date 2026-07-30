// controllers/attendance.controller.js
const db = require('../config/db');

const ATTENDANCE_TIME_ZONE = process.env.ATTENDANCE_TIME_ZONE || 'Africa/Accra';
const DEFAULT_OVERTIME_CUTOFF = '17:30:00';

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
    const attendance = updated[0];
    const cutoff = await db.query(
      `SELECT COALESCE((SELECT late_clock_out_after FROM company_overtime_settings WHERE company_id=$1), TIME '${DEFAULT_OVERTIME_CUTOFF}') AS late_clock_out_after`,
      [req.user.company_id]
    );
    const cutoffTime = cutoff.rows[0].late_clock_out_after;
    const overtime = await db.query(
      `SELECT ROUND(GREATEST(0, EXTRACT(EPOCH FROM ($1::timestamptz - (($2::date + $3::time) AT TIME ZONE $4))) / 3600)::numeric, 2) AS hours`,
      [attendance.clock_out, attendance.work_date, cutoffTime, ATTENDANCE_TIME_ZONE]
    );
    attendance.overtime_eligible = Number(overtime.rows[0].hours) > 0;
    attendance.overtime_hours = Number(overtime.rows[0].hours);
    res.json(attendance);
  } catch (err) {
    res.status(500).json({ error: 'Could not clock out' });
  }
};

// Employee: submit overtime after an eligible late clock-out.
exports.submitOvertime = async (req, res) => {
  try {
    const reason = String(req.body.reason || '').trim();
    if (reason.length < 3 || reason.length > 1000) return res.status(400).json({ error: 'Please enter an overtime reason between 3 and 1000 characters' });
    const { rows } = await db.query(
      `SELECT a.id, a.work_date,
              ROUND(GREATEST(0, EXTRACT(EPOCH FROM (a.clock_out - ((a.work_date + COALESCE(s.late_clock_out_after, TIME '${DEFAULT_OVERTIME_CUTOFF}')) AT TIME ZONE $3))) / 3600)::numeric, 2) AS overtime_hours
       FROM attendance a
       LEFT JOIN company_overtime_settings s ON s.company_id=a.company_id
       WHERE a.id=$1 AND a.company_id=$2 AND a.employee_id=$4 AND a.clock_out IS NOT NULL`,
      [req.body.attendance_id, req.user.company_id, ATTENDANCE_TIME_ZONE, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Attendance record not found' });
    const attendance = rows[0];
    if (Number(attendance.overtime_hours) <= 0) return res.status(400).json({ error: 'Overtime can only be submitted after the configured late clock-out time' });
    const saved = await db.query(
      `INSERT INTO overtime_requests (company_id, attendance_id, employee_id, work_date, reason, overtime_hours)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.company_id, attendance.id, req.user.id, attendance.work_date, reason, attendance.overtime_hours]
    );
    res.status(201).json(saved.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'An overtime form has already been submitted for this attendance record' });
    console.error(err);
    res.status(500).json({ error: 'Could not submit overtime form' });
  }
};

exports.getMyOvertime = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT o.*, COALESCE(s.hourly_rate, 0) AS hourly_rate
       FROM overtime_requests o LEFT JOIN company_overtime_settings s ON s.company_id=o.company_id
       WHERE o.company_id=$1 AND o.employee_id=$2 ORDER BY o.work_date DESC`,
      [req.user.company_id, req.user.id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Could not fetch overtime forms' }); }
};

exports.getOvertimeReport = async (req, res) => {
  try {
    const { month, year, status } = req.query;
    const params = [req.user.company_id];
    let where = 'WHERE o.company_id=$1';
    if (month) { params.push(month); where += ` AND EXTRACT(MONTH FROM o.work_date)=$${params.length}`; }
    if (year) { params.push(year); where += ` AND EXTRACT(YEAR FROM o.work_date)=$${params.length}`; }
    if (status) { params.push(status); where += ` AND o.status=$${params.length}`; }
    const { rows } = await db.query(
      `SELECT o.*, CONCAT(e.first_name, ' ', e.last_name) AS employee_name, e.job_title,
              COALESCE(s.hourly_rate, 0) AS hourly_rate
       FROM overtime_requests o JOIN employees e ON e.id=o.employee_id
       LEFT JOIN company_overtime_settings s ON s.company_id=o.company_id
       ${where} ORDER BY o.work_date DESC, o.created_at DESC`, params
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Could not fetch overtime report' }); }
};

exports.updateOvertimeStatus = async (req, res) => {
  try {
    const status = req.body.status;
    if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Status must be approved or rejected' });
    const { rows } = await db.query(
      `UPDATE overtime_requests SET status=$1, approved_by=$2, approved_at=NOW()
       WHERE id=$3 AND company_id=$4 AND status='pending' RETURNING *`,
      [status, req.user.id, req.params.id, req.user.company_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Pending overtime request not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: 'Could not update overtime request' }); }
};

exports.getOvertimeSettings = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT COALESCE((SELECT hourly_rate FROM company_overtime_settings WHERE company_id=$1), 0) AS hourly_rate,
              COALESCE((SELECT late_clock_out_after FROM company_overtime_settings WHERE company_id=$1), TIME '${DEFAULT_OVERTIME_CUTOFF}') AS late_clock_out_after`,
      [req.user.company_id]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: 'Could not fetch overtime settings' }); }
};

exports.updateOvertimeSettings = async (req, res) => {
  try {
    const hourlyRate = Number(req.body.hourly_rate);
    if (!Number.isFinite(hourlyRate) || hourlyRate < 0) return res.status(400).json({ error: 'Enter a valid non-negative hourly overtime rate' });
    const { rows } = await db.query(
      `INSERT INTO company_overtime_settings (company_id, hourly_rate, updated_at)
       VALUES ($1,$2,NOW())
       ON CONFLICT (company_id) DO UPDATE SET hourly_rate=EXCLUDED.hourly_rate, updated_at=NOW()
       RETURNING *`, [req.user.company_id, hourlyRate]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: 'Could not save overtime settings' }); }
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
