const db = require('../config/db');
const webpush = require('web-push');

const publicKey = process.env.VAPID_PUBLIC_KEY || '';
const privateKey = process.env.VAPID_PRIVATE_KEY || '';
const subject = process.env.VAPID_SUBJECT || 'mailto:hello@aduseimedia.codes';
const enabled = Boolean(publicKey && privateKey);

if (enabled) webpush.setVapidDetails(subject, publicKey, privateKey);

function titleFor(type) {
  const titles = {
    message: 'New message',
    announcement: 'New announcement',
    leave_request: 'Leave request',
    leave_approved: 'Leave approved',
    leave_rejected: 'Leave update',
    payroll: 'Payslip ready',
    review: 'Performance review',
    it_ticket: 'IT ticket update',
    welcome: 'Welcome to KenadHR'
  };
  return titles[type] || 'KenadHR update';
}

async function sendToEmployee({ companyId, employeeId, type, message, link }) {
  if (!enabled) return 0;
  const { rows } = await db.query(
    `SELECT id, endpoint, p256dh, auth, expiration_time
     FROM push_subscriptions
     WHERE company_id=$1 AND employee_id=$2`,
    [companyId, employeeId]
  );
  const payload = JSON.stringify({
    title: titleFor(type),
    body: String(message || 'You have a new KenadHR notification.').slice(0, 220),
    url: link || '/pages/staff-portal.html#overview',
    tag: `kenadhr-${type || 'notification'}-${employeeId}`,
    type: type || 'notification'
  });

  await Promise.all(rows.map(async (subscription) => {
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        expirationTime: subscription.expiration_time,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth }
      }, payload, { TTL: 60 * 60 * 12, urgency: type === 'message' ? 'high' : 'normal' });
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) {
        await db.query('DELETE FROM push_subscriptions WHERE id=$1', [subscription.id]);
        return;
      }
      console.error('Web push delivery failed:', error.statusCode || error.message);
    }
  }));
  return rows.length;
}

async function notifyEmployee({ companyId, employeeId, type, message, link = null }) {
  const { rows } = await db.query(
    `INSERT INTO notifications (company_id, employee_id, type, message, link)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [companyId, employeeId, type, message, link]
  );
  await sendToEmployee({ companyId, employeeId, type, message, link });
  return rows[0];
}

module.exports = { enabled, publicKey, sendToEmployee, notifyEmployee };
