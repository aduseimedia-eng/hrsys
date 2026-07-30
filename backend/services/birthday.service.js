const db = require('../config/db');
const { notifyEmployee } = require('./push.service');

const TIME_ZONE = process.env.ATTENDANCE_TIME_ZONE || 'Africa/Accra';

function todayInTimeZone() {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const value = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return { year: value.year, monthDay: `${value.month}-${value.day}` };
}

async function sendBirthdayNotifications() {
  const { year, monthDay } = todayInTimeZone();
  const { rows: birthdays } = await db.query(
    `SELECT id, company_id, first_name, last_name FROM employees
     WHERE is_active=true AND date_of_birth IS NOT NULL AND TO_CHAR(date_of_birth, 'MM-DD')=$1`, [monthDay]
  );
  for (const birthdayEmployee of birthdays) {
    const name = `${birthdayEmployee.first_name} ${birthdayEmployee.last_name}`.trim();
    const { rows: recipients } = await db.query('SELECT id FROM employees WHERE company_id=$1 AND is_active=true', [birthdayEmployee.company_id]);
    await Promise.all(recipients.map((recipient) => notifyEmployee({
      companyId: birthdayEmployee.company_id,
      employeeId: recipient.id,
      type: 'birthday',
      message: recipient.id === birthdayEmployee.id
        ? `Happy birthday, ${birthdayEmployee.first_name}! Congratulations and best wishes from everyone at KenadHR.`
        : `Today is ${name}'s birthday. Join us in wishing them a happy birthday!`,
      link: '/pages/staff-portal.html#overview',
      eventKey: `birthday-${birthdayEmployee.id}-${year}`
    })));
  }
  return birthdays.length;
}

function startBirthdayNotifier() {
  const run = () => sendBirthdayNotifications().catch((error) => console.error('Birthday notification job failed:', error));
  run();
  return setInterval(run, 60 * 60 * 1000);
}

module.exports = { sendBirthdayNotifications, startBirthdayNotifier };
