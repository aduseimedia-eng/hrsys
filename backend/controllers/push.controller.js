const db = require('../config/db');
const push = require('../services/push.service');

function validSubscription(subscription) {
  return subscription && typeof subscription.endpoint === 'string'
    && subscription.endpoint.startsWith('https://')
    && typeof subscription.keys?.p256dh === 'string'
    && typeof subscription.keys?.auth === 'string';
}

exports.status = async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT 1 FROM push_subscriptions WHERE company_id=$1 AND employee_id=$2 LIMIT 1',
      [req.user.company_id, req.user.id]
    );
    res.json({ configured: push.enabled, publicKey: push.enabled ? push.publicKey : null, subscribed: rows.length > 0 });
  } catch (error) {
    res.status(500).json({ error: 'Could not get push notification status' });
  }
};

exports.subscribe = async (req, res) => {
  try {
    const subscription = req.body;
    if (!validSubscription(subscription)) return res.status(400).json({ error: 'Invalid push subscription' });
    await db.query(
      `INSERT INTO push_subscriptions (company_id, employee_id, endpoint, p256dh, auth, expiration_time, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (endpoint) DO UPDATE
       SET company_id=EXCLUDED.company_id, employee_id=EXCLUDED.employee_id,
           p256dh=EXCLUDED.p256dh, auth=EXCLUDED.auth,
           expiration_time=EXCLUDED.expiration_time, user_agent=EXCLUDED.user_agent, updated_at=NOW()`,
      [req.user.company_id, req.user.id, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth,
        subscription.expirationTime ? new Date(subscription.expirationTime) : null, String(req.get('user-agent') || '').slice(0, 500)]
    );
    res.status(201).json({ subscribed: true });
  } catch (error) {
    res.status(500).json({ error: 'Could not save this device for notifications' });
  }
};

exports.unsubscribe = async (req, res) => {
  try {
    const endpoint = String(req.body.endpoint || '');
    if (!endpoint) return res.status(400).json({ error: 'Subscription endpoint is required' });
    await db.query('DELETE FROM push_subscriptions WHERE company_id=$1 AND employee_id=$2 AND endpoint=$3', [req.user.company_id, req.user.id, endpoint]);
    res.json({ subscribed: false });
  } catch (error) {
    res.status(500).json({ error: 'Could not remove this device' });
  }
};

exports.test = async (req, res) => {
  try {
    if (!push.enabled) return res.status(503).json({ error: 'Web push is not configured yet' });
    const sent = await push.sendToEmployee({
      companyId: req.user.company_id,
      employeeId: req.user.id,
      type: 'notification',
      message: 'Web push is working on this device.',
      link: '/pages/staff-portal.html#overview'
    });
    if (!sent) return res.status(409).json({ error: 'Enable device alerts on this device first' });
    res.json({ sent: true });
  } catch (error) {
    res.status(500).json({ error: 'Could not send a test notification' });
  }
};
