const DEFAULT_WORKING_DAYS = Object.freeze([1, 2, 3, 4, 5]);

function normalizeWorkingDays(value, { fallback = false } = {}) {
  if (!Array.isArray(value) || value.length === 0) {
    return fallback ? [...DEFAULT_WORKING_DAYS] : null;
  }

  const parsed = value.map((day) => (typeof day === 'number' ? day : NaN));
  if (parsed.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) return null;
  return [...new Set(parsed)].sort((left, right) => left - right);
}

function legacyWorkingDays(value) {
  const label = String(value || '').trim().toLowerCase().replace(/[\u2013\u2014]/g, '-');
  if (label === 'monday-saturday') return [1, 2, 3, 4, 5, 6];
  if (label === 'sunday-thursday') return [0, 1, 2, 3, 4];
  return [...DEFAULT_WORKING_DAYS];
}

function workingDaysLabel(value) {
  const days = normalizeWorkingDays(value, { fallback: true });
  const key = days.join(',');
  if (key === '1,2,3,4,5') return 'Monday-Friday';
  if (key === '1,2,3,4,5,6') return 'Monday-Saturday';
  if (key === '0,1,2,3,4') return 'Sunday-Thursday';
  const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days.map((day) => labels[day]).join(',');
}

async function resolveCompanyWorkingDays(companyId, executor) {
  const { rows } = await executor.query(
    `SELECT company.work_week, schedule.id, schedule.name, schedule.start_time,
            schedule.end_time, schedule.break_minutes, schedule.weekdays
     FROM companies company
     LEFT JOIN LATERAL (
       SELECT id, name, start_time, end_time, break_minutes, weekdays
       FROM work_schedules
       WHERE company_id=company.id AND is_default=true
       ORDER BY id DESC
       LIMIT 1
     ) schedule ON TRUE
     WHERE company.id=$1`,
    [companyId]
  );
  const row = rows[0] || {};
  const configuredDays = normalizeWorkingDays(row.weekdays);
  const workingDays = configuredDays || legacyWorkingDays(row.work_week);

  return {
    id: row.id || null,
    name: row.name || 'Standard workweek',
    start_time: row.start_time || '09:00:00',
    end_time: row.end_time || '17:30:00',
    break_minutes: Number(row.break_minutes || 0),
    weekdays: workingDays,
    working_days: workingDays,
    is_default: true,
    source: row.id ? 'default_schedule' : (row.work_week ? 'company_profile' : 'fallback')
  };
}

module.exports = {
  DEFAULT_WORKING_DAYS,
  normalizeWorkingDays,
  resolveCompanyWorkingDays,
  workingDaysLabel
};
