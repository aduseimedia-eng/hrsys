const db = require('../config/db');

const weekdays = (value) => Array.isArray(value) && value.length
  ? [...new Set(value.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort((a, b) => a - b)
  : [1, 2, 3, 4, 5];

exports.list = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT s.*, COUNT(a.id)::int AS assigned_count
       FROM work_schedules s LEFT JOIN employee_schedule_assignments a ON a.schedule_id=s.id
       WHERE s.company_id=$1 GROUP BY s.id ORDER BY s.is_default DESC, s.name`, [req.user.company_id]
    );
    res.json(rows);
  } catch { res.status(500).json({ error: 'Could not load schedules' }); }
};

exports.create = async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const startTime = String(req.body.start_time || '');
    const endTime = String(req.body.end_time || '');
    const breakMinutes = Number(req.body.break_minutes || 0);
    if (!name || !/^\d{2}:\d{2}/.test(startTime) || !/^\d{2}:\d{2}/.test(endTime) || !Number.isInteger(breakMinutes) || breakMinutes < 0 || breakMinutes > 720) return res.status(400).json({ error: 'Enter a schedule name, valid start/end time, and break duration' });
    const { rows } = await db.query(
      `INSERT INTO work_schedules (company_id,name,start_time,end_time,break_minutes,weekdays,is_default)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.user.company_id, name, startTime, endTime, breakMinutes, weekdays(req.body.weekdays), Boolean(req.body.is_default)]
    );
    res.status(201).json(rows[0]);
  } catch { res.status(500).json({ error: 'Could not create schedule' }); }
};

exports.assign = async (req, res) => {
  try {
    const employeeId = Number(req.body.employee_id);
    const scheduleId = Number(req.body.schedule_id);
    const startsOn = String(req.body.starts_on || new Date().toISOString().slice(0, 10));
    const endsOn = req.body.ends_on ? String(req.body.ends_on) : null;
    if (!Number.isInteger(employeeId) || !Number.isInteger(scheduleId) || !/^\d{4}-\d{2}-\d{2}$/.test(startsOn) || (endsOn && !/^\d{4}-\d{2}-\d{2}$/.test(endsOn))) return res.status(400).json({ error: 'Enter a staff member, schedule, and valid assignment dates' });
    const { rows } = await db.query(
      `INSERT INTO employee_schedule_assignments (company_id,employee_id,schedule_id,starts_on,ends_on)
       SELECT $1,$2,s.id,$3,$4 FROM work_schedules s WHERE s.id=$5 AND s.company_id=$1 RETURNING *`,
      [req.user.company_id, employeeId, startsOn, endsOn, scheduleId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Schedule not found' });
    res.status(201).json(rows[0]);
  } catch { res.status(500).json({ error: 'Could not assign schedule' }); }
};

exports.mine = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT s.*, a.starts_on, a.ends_on FROM employee_schedule_assignments a
       JOIN work_schedules s ON s.id=a.schedule_id
       WHERE a.company_id=$1 AND a.employee_id=$2 AND a.starts_on <= CURRENT_DATE
         AND (a.ends_on IS NULL OR a.ends_on >= CURRENT_DATE)
       ORDER BY a.starts_on DESC LIMIT 1`, [req.user.company_id, req.user.id]
    );
    res.json(rows[0] || null);
  } catch { res.status(500).json({ error: 'Could not load schedule' }); }
};
