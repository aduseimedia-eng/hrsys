// controllers/leave.controller.js
const db = require('../config/db');
const { notifyEmployee } = require('../services/push.service');
const {
  DEFAULT_WORKING_DAYS,
  normalizeWorkingDays,
  resolveCompanyWorkingDays
} = require('../services/work-schedule.service');

const DEFAULT_LEAVE_POLICY = Object.freeze({
  annual_entitlement_days: 20,
  count_weekends: true,
  count_public_holidays: true,
  max_consecutive_days: null,
  minimum_notice_days: 0,
  updated_at: null
});

function normalizeLeavePolicy(row = {}, workingDays = DEFAULT_WORKING_DAYS) {
  const countNonWorkingDays = row.count_non_working_days
    ?? row.count_weekends
    ?? DEFAULT_LEAVE_POLICY.count_weekends;
  return {
    annual_entitlement_days: Number(row.annual_entitlement_days ?? DEFAULT_LEAVE_POLICY.annual_entitlement_days),
    count_non_working_days: countNonWorkingDays,
    // Retained for clients deployed before configurable company working days.
    count_weekends: countNonWorkingDays,
    count_public_holidays: row.count_public_holidays ?? DEFAULT_LEAVE_POLICY.count_public_holidays,
    working_days: normalizeWorkingDays(workingDays, { fallback: true }),
    max_consecutive_days: row.max_consecutive_days == null ? null : Number(row.max_consecutive_days),
    minimum_notice_days: Number(row.minimum_notice_days ?? DEFAULT_LEAVE_POLICY.minimum_notice_days),
    updated_at: row.updated_at || null
  };
}

async function leavePolicy(companyId, executor = db) {
  const { rows } = await executor.query(
    `SELECT annual_entitlement_days, count_weekends, count_public_holidays,
            max_consecutive_days, minimum_notice_days, updated_at
     FROM company_leave_settings WHERE company_id=$1`,
    [companyId]
  );
  const schedule = await resolveCompanyWorkingDays(companyId, executor);
  return normalizeLeavePolicy(rows[0], schedule.working_days);
}

function strictBoolean(value) {
  if (value === true || value === 1 || value === '1' || value === 'true') return true;
  if (value === false || value === 0 || value === '0' || value === 'false') return false;
  return null;
}

function dateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? null : value;
}

function storedDateOnly(value) {
  if (typeof value === 'string') return dateOnly(value);
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function daysFromToday(date) {
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.floor((Date.parse(`${date}T00:00:00.000Z`) - todayUtc) / 86400000);
}

async function leaveDaysBetween(companyId, startDate, endDate, policy, executor = db) {
  const { rows } = await executor.query(
    `SELECT COUNT(*)::int AS days
     FROM generate_series($2::date, $3::date, '1 day'::interval) AS days(leave_day)
     WHERE ($4::boolean OR EXTRACT(DOW FROM leave_day)::int = ANY($6::smallint[]))
       AND ($5::boolean OR NOT EXISTS (
         SELECT 1 FROM company_calendar_events holiday
         WHERE holiday.company_id=$1 AND holiday.category='holiday'
           AND leave_day::date BETWEEN holiday.start_date AND holiday.end_date
       ))`,
    [companyId, startDate, endDate, policy.count_non_working_days,
      policy.count_public_holidays, policy.working_days]
  );
  return Number(rows[0]?.days || 0);
}

async function annualLeaveDays(companyId, employeeId, year, statuses, policy, executor = db) {
  const { rows } = await executor.query(
    `SELECT COUNT(*)::int AS days
     FROM leave_requests request
     CROSS JOIN LATERAL generate_series(request.start_date, request.end_date, '1 day'::interval) AS days(leave_day)
     WHERE request.company_id=$1 AND request.employee_id=$2 AND request.leave_type='annual'
       AND request.status = ANY($3::varchar[]) AND EXTRACT(YEAR FROM leave_day)=$4
       AND ($5::boolean OR EXTRACT(DOW FROM leave_day)::int = ANY($7::smallint[]))
       AND ($6::boolean OR NOT EXISTS (
         SELECT 1 FROM company_calendar_events holiday
         WHERE holiday.company_id=request.company_id AND holiday.category='holiday'
           AND leave_day::date BETWEEN holiday.start_date AND holiday.end_date
       ))`,
    [companyId, employeeId, statuses, year, policy.count_non_working_days,
      policy.count_public_holidays, policy.working_days]
  );
  return Number(rows[0]?.days || 0);
}

async function annualLeaveBalance(companyId, employeeId, year, policy, executor = db) {
  const { rows } = await executor.query(
    `SELECT
       (COUNT(*) FILTER (WHERE request.status='approved'))::int AS used,
       (COUNT(*) FILTER (WHERE request.status='pending'))::int AS pending
     FROM leave_requests request
     CROSS JOIN LATERAL generate_series(request.start_date, request.end_date, '1 day'::interval) AS days(leave_day)
     WHERE request.company_id=$1 AND request.employee_id=$2 AND request.leave_type='annual'
       AND request.status IN ('approved','pending') AND EXTRACT(YEAR FROM leave_day)=$3
       AND ($4::boolean OR EXTRACT(DOW FROM leave_day)::int = ANY($6::smallint[]))
       AND ($5::boolean OR NOT EXISTS (
         SELECT 1 FROM company_calendar_events holiday
         WHERE holiday.company_id=request.company_id AND holiday.category='holiday'
           AND leave_day::date BETWEEN holiday.start_date AND holiday.end_date
       ))`,
    [companyId, employeeId, year, policy.count_non_working_days,
      policy.count_public_holidays, policy.working_days]
  );
  return {
    used: Number(rows[0]?.used || 0),
    pending: Number(rows[0]?.pending || 0)
  };
}

exports.getSettings = async (req, res) => {
  try {
    res.json(await leavePolicy(req.user.company_id));
  } catch (error) {
    res.status(500).json({ error: 'Could not fetch leave settings' });
  }
};

exports.updateSettings = async (req, res) => {
  const body = req.body || {};
  const annualEntitlement = Number(body.annual_entitlement_days);
  const hasCountNonWorkingDays = Object.prototype.hasOwnProperty.call(body, 'count_non_working_days');
  const hasLegacyCountWeekends = Object.prototype.hasOwnProperty.call(body, 'count_weekends');
  const countNonWorkingDays = strictBoolean(hasCountNonWorkingDays
    ? body.count_non_working_days
    : body.count_weekends);
  const legacyCountWeekends = hasLegacyCountWeekends ? strictBoolean(body.count_weekends) : countNonWorkingDays;
  const countPublicHolidays = strictBoolean(body.count_public_holidays);
  const minimumNoticeDays = Number(body.minimum_notice_days);
  const rawMaximum = body.max_consecutive_days;
  const maximumConsecutiveDays = rawMaximum === null || rawMaximum === undefined || rawMaximum === ''
    ? null
    : Number(rawMaximum);

  if (!Number.isInteger(annualEntitlement) || annualEntitlement < 1 || annualEntitlement > 365) {
    return res.status(400).json({ error: 'Annual entitlement must be between 1 and 365 days' });
  }
  if (countNonWorkingDays === null || legacyCountWeekends === null || countPublicHolidays === null) {
    return res.status(400).json({ error: 'Non-working-day and public-holiday rules must be true or false' });
  }
  if (hasCountNonWorkingDays && hasLegacyCountWeekends && countNonWorkingDays !== legacyCountWeekends) {
    return res.status(400).json({ error: 'Conflicting non-working-day rules were supplied' });
  }
  if (!Number.isInteger(minimumNoticeDays) || minimumNoticeDays < 0 || minimumNoticeDays > 365) {
    return res.status(400).json({ error: 'Minimum notice must be between 0 and 365 days' });
  }
  if (maximumConsecutiveDays !== null
    && (!Number.isInteger(maximumConsecutiveDays) || maximumConsecutiveDays < 1 || maximumConsecutiveDays > annualEntitlement)) {
    return res.status(400).json({ error: 'Maximum leave per request must be blank or between 1 and the annual entitlement' });
  }

  let client;
  try {
    client = await db.getClient();
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO company_leave_settings (
         company_id, annual_entitlement_days, count_weekends, count_public_holidays,
         max_consecutive_days, minimum_notice_days, updated_by, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
       ON CONFLICT (company_id) DO UPDATE SET
         annual_entitlement_days=EXCLUDED.annual_entitlement_days,
         count_weekends=EXCLUDED.count_weekends,
         count_public_holidays=EXCLUDED.count_public_holidays,
         max_consecutive_days=EXCLUDED.max_consecutive_days,
         minimum_notice_days=EXCLUDED.minimum_notice_days,
         updated_by=EXCLUDED.updated_by,
         updated_at=NOW()
       RETURNING annual_entitlement_days, count_weekends, count_public_holidays,
         max_consecutive_days, minimum_notice_days, updated_at`,
      [req.user.company_id, annualEntitlement, countNonWorkingDays, countPublicHolidays,
        maximumConsecutiveDays, minimumNoticeDays, req.user.id]
    );
    const schedule = await resolveCompanyWorkingDays(req.user.company_id, client);
    await client.query(
      `INSERT INTO audit_logs(company_id, actor_id, action, entity_type, entity_id, summary)
       VALUES($1,$2,'update','leave_settings',$1,$3)`,
      [req.user.company_id, req.user.id,
        `Annual leave: ${annualEntitlement} days; maximum per request ${maximumConsecutiveDays ?? 'none'}; minimum notice ${minimumNoticeDays} days; non-working days ${countNonWorkingDays ? 'counted' : 'excluded'}; public holidays ${countPublicHolidays ? 'counted' : 'excluded'}`]
    );
    await client.query('COMMIT');
    res.json(normalizeLeavePolicy(rows[0], schedule.working_days));
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error(error);
    res.status(500).json({ error: 'Could not save leave settings' });
  } finally {
    if (client) client.release();
  }
};

// ─── Request leave ────────────────────────────────────────────
exports.request = async (req, res) => {
  const body = req.body || {};
  const { leave_type, start_date, end_date, reason } = body;
  const startDate = dateOnly(start_date);
  const endDate = dateOnly(end_date);
  if (!leave_type || !startDate || !endDate) {
    return res.status(400).json({ error: 'Type, start date and end date are required' });
  }
  if (endDate < startDate) {
    return res.status(400).json({ error: 'End date cannot be before start date' });
  }
  if (leave_type === 'annual' && startDate.slice(0, 4) !== endDate.slice(0, 4)) {
    return res.status(400).json({ error: 'Annual leave requests must fall within one calendar year' });
  }

  let client;
  let createdLeave;
  let recipients = [];
  try {
    client = await db.getClient();
    await client.query('BEGIN');
    // Requests and approvals for one employee share this lock. That makes the
    // overlap and entitlement checks deterministic under concurrent traffic.
    await client.query('SELECT pg_advisory_xact_lock($1::int, $2::int)', [req.user.company_id, req.user.id]);

    // Annual leave is a yearly entitlement. Requests may not span years and
    // pending requests reserve the days until HR makes a decision.
    if (leave_type === 'annual') {
      const policy = await leavePolicy(req.user.company_id, client);
      const year = Number(startDate.slice(0, 4));
      if (policy.minimum_notice_days > 0 && daysFromToday(startDate) < policy.minimum_notice_days) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: `Annual leave requires at least ${policy.minimum_notice_days} day(s) notice.` });
      }
      const requestedDays = await leaveDaysBetween(req.user.company_id, startDate, endDate, policy, client);
      if (requestedDays < 1) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'The selected dates do not contain a chargeable annual leave day' });
      }
      if (policy.max_consecutive_days !== null && requestedDays > policy.max_consecutive_days) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: `Annual leave is limited to ${policy.max_consecutive_days} chargeable day(s) per request.` });
      }
      const reservedDays = await annualLeaveDays(req.user.company_id, req.user.id, year, ['pending', 'approved'], policy, client);
      if (reservedDays + requestedDays > policy.annual_entitlement_days) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: `This request exceeds your annual leave balance. ${Math.max(0, policy.annual_entitlement_days - reservedDays)} day(s) remain.` });
      }
    }

    const overlap = await client.query(
      `SELECT id FROM leave_requests
       WHERE company_id=$1 AND employee_id=$2 AND status IN ('pending','approved')
         AND NOT (end_date < $3 OR start_date > $4)`,
      [req.user.company_id, req.user.id, startDate, endDate]
    );
    if (overlap.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Overlapping leave request exists' });
    }

    const { rows } = await client.query(
      `INSERT INTO leave_requests (company_id, employee_id, leave_type, start_date, end_date, reason)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.company_id, req.user.id, leave_type, startDate, endDate, reason]
    );

    // HR/Admin leave requests are routed to managers, who serve as the CEO approval queue.
    const recipientRoles = req.user.role === 'admin' ? ['manager'] : ['admin', 'manager'];
    const admins = await client.query(
      `SELECT id FROM employees
       WHERE company_id=$1
         AND role = ANY($2::varchar[])
         AND id <> $3
         AND is_active=true`,
      [req.user.company_id, recipientRoles, req.user.id]
    );
    createdLeave = rows[0];
    recipients = admins.rows;
    await client.query('COMMIT');
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error(err);
    return res.status(500).json({ error: 'Could not submit leave request' });
  } finally {
    if (client) client.release();
  }

  const empName = `${req.user.first_name} ${req.user.last_name}`;
  for (const recipient of recipients) {
    try {
      await notifyEmployee({ companyId: req.user.company_id, employeeId: recipient.id, type: 'leave_request', message: `${empName} has requested ${leave_type} leave from ${startDate} to ${endDate}.`, link: '/pages/workspace.html#leave' });
    } catch (error) {
      console.error('Could not notify leave approver:', error);
    }
  }
  return res.status(201).json(createdLeave);
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

exports.getMyBalance = async (req, res) => {
  try {
    const requestedYear = Number(req.query.year || new Date().getFullYear());
    const year = Number.isInteger(requestedYear) && requestedYear >= 2000 && requestedYear <= 2100
      ? requestedYear
      : new Date().getFullYear();
    const policy = await leavePolicy(req.user.company_id);
    const { used, pending } = await annualLeaveBalance(
      req.user.company_id,
      req.user.id,
      year,
      policy
    );
    res.json({
      year,
      entitlement: policy.annual_entitlement_days,
      used,
      pending,
      available: Math.max(0, policy.annual_entitlement_days - used - pending),
      count_non_working_days: policy.count_non_working_days,
      count_weekends: policy.count_weekends,
      count_public_holidays: policy.count_public_holidays,
      working_days: policy.working_days
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not calculate leave balance' });
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

    const policy = await leavePolicy(req.user.company_id);
    const entitlementParam = params.length + 1;
    const countNonWorkingDaysParam = params.length + 2;
    const countPublicHolidaysParam = params.length + 3;
    const workingDaysParam = params.length + 4;

    const { rows } = await db.query(
      `SELECT lr.*, CONCAT(e.first_name,' ',e.last_name) AS employee_name,
              e.photo_url, d.name AS department_name,
              CONCAT(a.first_name,' ',a.last_name) AS approver_name,
              $${entitlementParam}::int AS annual_entitlement,
              COALESCE(lb.annual_used_days, 0)::int AS annual_used_days,
              COALESCE(lb.annual_pending_days, 0)::int AS annual_pending_days,
              GREATEST($${entitlementParam}::int - COALESCE(lb.annual_used_days, 0)::int, 0) AS annual_remaining_days
       FROM leave_requests lr
       JOIN employees e        ON e.id = lr.employee_id AND e.company_id=lr.company_id
       LEFT JOIN departments d ON d.id = e.department_id AND d.company_id=e.company_id
       LEFT JOIN employees a   ON a.id = lr.approved_by AND a.company_id=lr.company_id
       LEFT JOIN LATERAL (
         SELECT
           COUNT(*) FILTER (WHERE approved.status = 'approved') AS annual_used_days,
           COUNT(*) FILTER (WHERE approved.status = 'pending') AS annual_pending_days
         FROM leave_requests approved
         CROSS JOIN LATERAL generate_series(approved.start_date, approved.end_date, '1 day'::interval) AS days(leave_day)
         WHERE approved.company_id = lr.company_id
           AND approved.employee_id = lr.employee_id
           AND approved.leave_type = 'annual'
           AND EXTRACT(YEAR FROM leave_day) = EXTRACT(YEAR FROM CURRENT_DATE)
           AND ($${countNonWorkingDaysParam}::boolean OR EXTRACT(DOW FROM leave_day)::int = ANY($${workingDaysParam}::smallint[]))
           AND ($${countPublicHolidaysParam}::boolean OR NOT EXISTS (
             SELECT 1 FROM company_calendar_events holiday
             WHERE holiday.company_id=approved.company_id AND holiday.category='holiday'
               AND leave_day::date BETWEEN holiday.start_date AND holiday.end_date
           ))
       ) lb ON TRUE
       ${where}
       ORDER BY lr.created_at DESC`,
      [...params, policy.annual_entitlement_days, policy.count_non_working_days,
        policy.count_public_holidays, policy.working_days]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch leave requests' });
  }
};

// ─── Approve or reject ────────────────────────────────────────
exports.updateStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body || {};

  if (!['approved','rejected'].includes(status)) {
    return res.status(400).json({ error: 'Status must be approved or rejected' });
  }

  let client;
  let updatedLeave;
  try {
    client = await db.getClient();
    await client.query('BEGIN');
    const leaveRes = await client.query(
      `SELECT lr.*, e.role AS employee_role
       FROM leave_requests lr
       JOIN employees e ON e.id = lr.employee_id AND e.company_id=lr.company_id
       WHERE lr.id=$1 AND lr.company_id=$2
       FOR UPDATE OF lr`,
      [id, req.user.company_id]
    );
    if (!leaveRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Leave request not found' });
    }
    const leave = leaveRes.rows[0];
    await client.query('SELECT pg_advisory_xact_lock($1::int, $2::int)', [req.user.company_id, leave.employee_id]);

    if (leave.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Leave request already processed' });
    }
    if (leave.employee_id === req.user.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'You cannot approve your own leave request' });
    }
    if (leave.employee_role === 'admin' && req.user.role !== 'manager') {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'HR leave requests must be approved by the CEO/manager' });
    }

    // Recheck the entitlement at approval time so HR cannot approve annual
    // leave beyond the employee's yearly allowance.
    let policy;
    if (status === 'approved') policy = await leavePolicy(req.user.company_id, client);
    if (status === 'approved' && leave.leave_type === 'annual') {
      const startDate = storedDateOnly(leave.start_date);
      const endDate = storedDateOnly(leave.end_date);
      if (!startDate || !endDate) throw new Error('Leave request contains an invalid stored date');
      const year = Number(startDate.slice(0, 4));
      const requestedDays = await leaveDaysBetween(req.user.company_id, startDate, endDate, policy, client);
      if (policy.max_consecutive_days !== null && requestedDays > policy.max_consecutive_days) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: `Cannot approve this request: annual leave is limited to ${policy.max_consecutive_days} chargeable day(s) per request.` });
      }
      const approvedDays = await annualLeaveDays(req.user.company_id, leave.employee_id, year, ['approved'], policy, client);
      if (approvedDays + requestedDays > policy.annual_entitlement_days) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: `Cannot approve this request: only ${Math.max(0, policy.annual_entitlement_days - approvedDays)} annual leave day(s) remain.` });
      }
    }

    const { rows } = await client.query(
      `UPDATE leave_requests SET status=$1, approved_by=$2, approved_at=NOW()
       WHERE id=$3 AND company_id=$4 AND status='pending' RETURNING *`,
      [status, req.user.id, id, req.user.company_id]
    );
    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Leave request was already processed' });
    }

    // If approved, mark attendance as on-leave for those days
    if (status === 'approved') {
      await client.query(
        `INSERT INTO attendance (company_id, employee_id, work_date, status)
         SELECT $1, $2, leave_day::date, 'on-leave'
         FROM generate_series($3::date, $4::date, '1 day'::interval) AS days(leave_day)
         WHERE EXTRACT(DOW FROM leave_day)::int = ANY($5::smallint[])
           AND ($6::boolean OR NOT EXISTS (
             SELECT 1 FROM company_calendar_events holiday
             WHERE holiday.company_id=$1 AND holiday.category='holiday'
               AND leave_day::date BETWEEN holiday.start_date AND holiday.end_date
           ))
         ON CONFLICT (employee_id, work_date) DO UPDATE SET status='on-leave'`,
        [req.user.company_id, leave.employee_id, leave.start_date, leave.end_date,
          policy.working_days,
          leave.leave_type !== 'annual' || (policy?.count_public_holidays ?? true)]
      );
    }

    updatedLeave = rows[0];
    await client.query('COMMIT');
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error(err);
    return res.status(500).json({ error: 'Could not update leave status' });
  } finally {
    if (client) client.release();
  }

  try {
    await notifyEmployee({ companyId: req.user.company_id, employeeId: updatedLeave.employee_id, type: `leave_${status}`, message: `Your ${updatedLeave.leave_type} leave request has been ${status}.` });
  } catch (error) {
    console.error('Could not notify employee about leave decision:', error);
  }
  return res.json(updatedLeave);
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
