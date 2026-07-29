// controllers/leave.controller.js
const db = require('../config/db');
const { notifyEmployee } = require('../services/push.service');
const ANNUAL_LEAVE_ENTITLEMENT = 20;

async function annualLeaveDays(companyId, employeeId, year, statuses) {
  const { rows } = await db.query(
    `SELECT COALESCE(SUM(end_date - start_date + 1), 0)::int AS days
     FROM leave_requests
     WHERE company_id=$1 AND employee_id=$2 AND leave_type='annual'
       AND status = ANY($3::varchar[]) AND EXTRACT(YEAR FROM start_date)=$4`,
    [companyId, employeeId, statuses, year]
  );
  return Number(rows[0]?.days || 0);
}

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

    // Annual leave is a yearly entitlement. Requests may not span years and
    // pending requests reserve the days until HR makes a decision.
    if (leave_type === 'annual') {
      const year = new Date(`${start_date}T00:00:00`).getFullYear();
      const endYear = new Date(`${end_date}T00:00:00`).getFullYear();
      if (year !== endYear) return res.status(400).json({ error: 'Annual leave requests must fall within one calendar year' });
      const requestedDays = Math.floor((new Date(`${end_date}T00:00:00`) - new Date(`${start_date}T00:00:00`)) / 86400000) + 1;
      const reservedDays = await annualLeaveDays(req.user.company_id, req.user.id, year, ['pending', 'approved']);
      if (reservedDays + requestedDays > ANNUAL_LEAVE_ENTITLEMENT) {
        return res.status(409).json({ error: `This request exceeds your annual leave balance. ${Math.max(0, ANNUAL_LEAVE_ENTITLEMENT - reservedDays)} day(s) remain.` });
      }
    }

    // Check for overlapping approved leave
    const overlap = await db.query(
      `SELECT id FROM leave_requests
       WHERE company_id=$1 AND employee_id=$2 AND status IN ('pending','approved')
         AND NOT (end_date < $3 OR start_date > $4)`,
      [req.user.company_id, req.user.id, start_date, end_date]
    );
    if (overlap.rows.length) return res.status(409).json({ error: 'Overlapping leave request exists' });

    const { rows } = await db.query(
      `INSERT INTO leave_requests (company_id, employee_id, leave_type, start_date, end_date, reason)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.company_id, req.user.id, leave_type, start_date, end_date, reason]
    );

    // HR/Admin leave requests are routed to managers, who serve as the CEO approval queue.
    const recipientRoles = req.user.role === 'admin' ? ['manager'] : ['admin', 'manager'];
    const admins = await db.query(
      `SELECT id FROM employees
       WHERE company_id=$1
         AND role = ANY($2::varchar[])
         AND id <> $3
         AND is_active=true`,
      [req.user.company_id, recipientRoles, req.user.id]
    );
    const empName = `${req.user.first_name} ${req.user.last_name}`;
    for (const admin of admins.rows) {
      await notifyEmployee({ companyId: req.user.company_id, employeeId: admin.id, type: 'leave_request', message: `${empName} has requested ${leave_type} leave from ${start_date} to ${end_date}.`, link: '/pages/workspace.html#leave' });
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
    const params = [req.user.company_id, req.user.id];
    let where = 'WHERE lr.company_id = $1 AND employee_id = $2';

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
    const { status, department_id, employee_id, from, to } = req.query;
    const params = [req.user.company_id];
    let where = 'WHERE lr.company_id = $1';

    if (status)        { params.push(status);        where += ` AND lr.status = $${params.length}`; }
    if (department_id) { params.push(department_id); where += ` AND e.department_id = $${params.length}`; }
    if (employee_id)   { params.push(employee_id);   where += ` AND lr.employee_id = $${params.length}`; }
    if (from)          { params.push(from);          where += ` AND lr.start_date >= $${params.length}`; }
    if (to)            { params.push(to);            where += ` AND lr.end_date <= $${params.length}`; }
    if (req.user.role === 'admin') {
      where += ` AND e.role <> 'admin'`;
    }

    const { rows } = await db.query(
      `SELECT lr.*, CONCAT(e.first_name,' ',e.last_name) AS employee_name,
              e.photo_url, d.name AS department_name,
              CONCAT(a.first_name,' ',a.last_name) AS approver_name,
              $${params.length + 1}::int AS annual_entitlement,
              COALESCE(lb.annual_used_days, 0)::int AS annual_used_days,
              COALESCE(lb.annual_pending_days, 0)::int AS annual_pending_days,
              GREATEST($${params.length + 1}::int - COALESCE(lb.annual_used_days, 0)::int, 0) AS annual_remaining_days
       FROM leave_requests lr
       JOIN employees e        ON e.id = lr.employee_id
       LEFT JOIN departments d ON d.id = e.department_id
       LEFT JOIN employees a   ON a.id = lr.approved_by
       LEFT JOIN LATERAL (
         SELECT
           SUM((approved.end_date - approved.start_date + 1)) FILTER (WHERE approved.status = 'approved') AS annual_used_days,
           SUM((approved.end_date - approved.start_date + 1)) FILTER (WHERE approved.status = 'pending') AS annual_pending_days
         FROM leave_requests approved
         WHERE approved.company_id = lr.company_id
           AND approved.employee_id = lr.employee_id
           AND approved.leave_type = 'annual'
           AND EXTRACT(YEAR FROM approved.start_date) = EXTRACT(YEAR FROM CURRENT_DATE)
       ) lb ON TRUE
       ${where}
       ORDER BY lr.created_at DESC`,
      [...params, ANNUAL_LEAVE_ENTITLEMENT]
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

    const leaveRes = await db.query(
      `SELECT lr.*, e.role AS employee_role
       FROM leave_requests lr
       JOIN employees e ON e.id = lr.employee_id
       WHERE lr.id=$1 AND lr.company_id=$2`,
      [id, req.user.company_id]
    );
    if (!leaveRes.rows.length) return res.status(404).json({ error: 'Leave request not found' });
    const leave = leaveRes.rows[0];

    if (leave.status !== 'pending') {
      return res.status(400).json({ error: 'Leave request already processed' });
    }
    if (leave.employee_id === req.user.id) {
      return res.status(403).json({ error: 'You cannot approve your own leave request' });
    }
    if (leave.employee_role === 'admin' && req.user.role !== 'manager') {
      return res.status(403).json({ error: 'HR leave requests must be approved by the CEO/manager' });
    }

    // Recheck the entitlement at approval time so HR cannot approve annual
    // leave beyond the employee's yearly allowance.
    if (status === 'approved' && leave.leave_type === 'annual') {
      const year = new Date(leave.start_date).getFullYear();
      const requestedDays = Math.floor((new Date(leave.end_date) - new Date(leave.start_date)) / 86400000) + 1;
      const approvedDays = await annualLeaveDays(req.user.company_id, leave.employee_id, year, ['approved']);
      if (approvedDays + requestedDays > ANNUAL_LEAVE_ENTITLEMENT) {
        return res.status(409).json({ error: `Cannot approve this request: only ${Math.max(0, ANNUAL_LEAVE_ENTITLEMENT - approvedDays)} annual leave day(s) remain.` });
      }
    }

    const { rows } = await db.query(
      `UPDATE leave_requests SET status=$1, approved_by=$2, approved_at=NOW()
       WHERE id=$3 AND company_id=$4 RETURNING *`,
      [status, req.user.id, id, req.user.company_id]
    );

    // If approved, mark attendance as on-leave for those days
    if (status === 'approved') {
      await db.query(
        `INSERT INTO attendance (company_id, employee_id, work_date, status)
         SELECT $1, $2, d::date, 'on-leave'
         FROM generate_series($3::date, $4::date, '1 day'::interval) d
         WHERE EXTRACT(DOW FROM d) NOT IN (0,6)
         ON CONFLICT (employee_id, work_date) DO UPDATE SET status='on-leave'`,
        [req.user.company_id, leave.employee_id, leave.start_date, leave.end_date]
      );

    }

    // Notify employee of the decision.
    await notifyEmployee({ companyId: req.user.company_id, employeeId: leave.employee_id, type: `leave_${status}`, message: `Your ${leave.leave_type} leave request has been ${status}.` });

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
    const params = [req.user.company_id, year];
    let where = 'WHERE lr.company_id = $1 AND status = \'approved\' AND EXTRACT(YEAR FROM start_date) = $2';
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
