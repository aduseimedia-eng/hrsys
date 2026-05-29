// controllers/leave.controller.js
const db = require('../config/db');

// ─── Request leave ────────────────────────────────────────────
exports.request = async (req, res) => {
  try {
    const { leave_type, start_date, end_date, reason } = req.body;
    if (!leave_type || !start_date || !end_date) {
      return res.status(400).json({ error: 'Type, start date and end date are required' });
    }
    if (new Date(end_date) < new Date(start_date)) {
      return res.status(400).json({ error: 'End date cannot be before start date' });
    }

    // Check for overlapping approved leave
    const overlap = await db.query(
      `SELECT id FROM leave_requests
       WHERE employee_id=$1 AND status IN ('pending','approved')
         AND NOT (end_date < $2 OR start_date > $3)`,
      [req.user.id, start_date, end_date]
    );
    if (overlap.rows.length) return res.status(409).json({ error: 'Overlapping leave request exists' });

    const { rows } = await db.query(
      `INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, reason)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.user.id, leave_type, start_date, end_date, reason]
    );

    // Notify admin/managers
    const admins = await db.query("SELECT id FROM employees WHERE role IN ('admin','manager') AND is_active=true");
    const empName = `${req.user.first_name} ${req.user.last_name}`;
    for (const admin of admins.rows) {
      await db.query(
        "INSERT INTO notifications (employee_id,type,message,link) VALUES ($1,'leave_request',$2,'/leave')",
        [admin.id, `${empName} has requested ${leave_type} leave from ${start_date} to ${end_date}.`]
      );
    }

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not submit leave request' });
  }
};

// ─── My leave history ─────────────────────────────────────────
exports.getMyLeaves = async (req, res) => {
  try {
    const { status, year } = req.query;
    const params = [req.user.id];
    let where = 'WHERE employee_id = $1';

    if (status) { params.push(status); where += ` AND status = $${params.length}`; }
    if (year)   { params.push(year);   where += ` AND EXTRACT(YEAR FROM start_date) = $${params.length}`; }

    const { rows } = await db.query(
      `SELECT lr.*, CONCAT(e.first_name,' ',e.last_name) AS approver_name
       FROM leave_requests lr
       LEFT JOIN employees e ON e.id = lr.approved_by
       ${where} ORDER BY lr.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch leave history' });
  }
};

// ─── HR: All leave requests ───────────────────────────────────
exports.getAll = async (req, res) => {
  try {
    const { status, department_id, from, to } = req.query;
    const params = [];
    let where = 'WHERE 1=1';

    if (status)        { params.push(status);        where += ` AND lr.status = $${params.length}`; }
    if (department_id) { params.push(department_id); where += ` AND e.department_id = $${params.length}`; }
    if (from)          { params.push(from);          where += ` AND lr.start_date >= $${params.length}`; }
    if (to)            { params.push(to);            where += ` AND lr.end_date <= $${params.length}`; }

    const { rows } = await db.query(
      `SELECT lr.*, CONCAT(e.first_name,' ',e.last_name) AS employee_name,
              e.photo_url, d.name AS department_name,
              CONCAT(a.first_name,' ',a.last_name) AS approver_name
       FROM leave_requests lr
       JOIN employees e        ON e.id = lr.employee_id
       LEFT JOIN departments d ON d.id = e.department_id
       LEFT JOIN employees a   ON a.id = lr.approved_by
       ${where}
       ORDER BY lr.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch leave requests' });
  }
};

// ─── Approve or reject ────────────────────────────────────────
exports.updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['approved','rejected'].includes(status)) {
      return res.status(400).json({ error: 'Status must be approved or rejected' });
    }

    const leaveRes = await db.query('SELECT * FROM leave_requests WHERE id=$1', [id]);
    if (!leaveRes.rows.length) return res.status(404).json({ error: 'Leave request not found' });
    const leave = leaveRes.rows[0];

    if (leave.status !== 'pending') {
      return res.status(400).json({ error: 'Leave request already processed' });
    }

    const { rows } = await db.query(
      `UPDATE leave_requests SET status=$1, approved_by=$2, approved_at=NOW()
       WHERE id=$3 RETURNING *`,
      [status, req.user.id, id]
    );

    // If approved, mark attendance as on-leave for those days
    if (status === 'approved') {
      await db.query(
        `INSERT INTO attendance (employee_id, work_date, status)
         SELECT $1, d::date, 'on-leave'
         FROM generate_series($2::date, $3::date, '1 day'::interval) d
         WHERE EXTRACT(DOW FROM d) NOT IN (0,6)
         ON CONFLICT (employee_id, work_date) DO UPDATE SET status='on-leave'`,
        [leave.employee_id, leave.start_date, leave.end_date]
      );

    }

    // Notify employee of the decision.
    await db.query(
      "INSERT INTO notifications (employee_id,type,message) VALUES ($1,$2,$3)",
      [leave.employee_id, `leave_${status}`, `Your ${leave.leave_type} leave request has been ${status}.`]
    );

    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not update leave status' });
  }
};

// ─── Leave calendar (all approved) ───────────────────────────
exports.getCalendar = async (req, res) => {
  try {
    const { year = new Date().getFullYear(), month } = req.query;
    const params = [year];
    let where = 'WHERE status = \'approved\' AND EXTRACT(YEAR FROM start_date) = $1';
    if (month) { params.push(month); where += ` AND EXTRACT(MONTH FROM start_date) = $${params.length}`; }

    const { rows } = await db.query(
      `SELECT lr.id, lr.start_date, lr.end_date, lr.leave_type,
              CONCAT(e.first_name,' ',e.last_name) AS employee_name, e.photo_url
       FROM leave_requests lr
       JOIN employees e ON e.id = lr.employee_id
       ${where} ORDER BY lr.start_date`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch calendar' });
  }
};
