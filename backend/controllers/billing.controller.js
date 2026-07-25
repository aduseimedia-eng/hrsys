const crypto = require('crypto');
const db = require('../config/db');
const { currency, publicPlans, findPlan } = require('../config/billing');

const PAYSTACK_API = 'https://api.paystack.co';
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

function configured() { return Boolean(process.env.PAYSTACK_SECRET_KEY); }
function callbackUrl(reference) {
  const base = process.env.PUBLIC_APP_URL || process.env.CLIENT_URL;
  if (!base || !/^https?:\/\//i.test(base)) throw new Error('Set PUBLIC_APP_URL to the public application URL before enabling billing');
  return new URL(`/pages/workspace.html?payment=return&reference=${encodeURIComponent(reference)}`, base).toString();
}

async function paystack(path, options = {}) {
  const response = await fetch(`${PAYSTACK_API}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.status) {
    const error = new Error(data.message || 'Paystack request failed');
    error.status = 502;
    throw error;
  }
  return data.data;
}

async function subscriptionFor(companyId) {
  await db.query(
    "UPDATE company_subscriptions SET status='expired', updated_at=NOW() WHERE company_id=$1 AND status='active' AND ends_at <= NOW()",
    [companyId]
  );
  const { rows } = await db.query(
    `SELECT plan_key, status, payment_reference, amount, currency, starts_at, ends_at, updated_at
     FROM company_subscriptions WHERE company_id=$1`, [companyId]
  );
  return rows[0] || null;
}

exports.plans = (req, res) => res.json({ plans: publicPlans(), billing_enabled: configured() });

exports.current = async (req, res) => {
  try { res.json({ subscription: await subscriptionFor(req.user.company_id), billing_enabled: configured() }); }
  catch (error) { res.status(500).json({ error: 'Could not load billing details' }); }
};

exports.checkout = async (req, res) => {
  try {
    if (!configured()) return res.status(503).json({ error: 'Online payments are not configured yet' });
    const plan = findPlan(req.body.plan_key);
    if (!plan) return res.status(400).json({ error: 'Choose a valid annual plan' });
    const reference = `kenadhr-${req.user.company_id}-${Date.now()}-${crypto.randomBytes(5).toString('hex')}`;
    await db.query(
      `INSERT INTO company_subscriptions (company_id, plan_key, status, payment_reference, amount, currency)
       VALUES ($1,$2,'pending',$3,$4,$5)
       ON CONFLICT (company_id) DO UPDATE SET plan_key=EXCLUDED.plan_key, status='pending', payment_reference=EXCLUDED.payment_reference, amount=EXCLUDED.amount, currency=EXCLUDED.currency, updated_at=NOW()`,
      [req.user.company_id, plan.key, reference, plan.amount, currency()]
    );
    const data = await paystack('/transaction/initialize', {
      method: 'POST',
      body: JSON.stringify({
        email: req.user.email,
        amount: String(plan.amount),
        currency: currency(),
        reference,
        callback_url: callbackUrl(reference),
        metadata: JSON.stringify({ company_id: req.user.company_id, plan_key: plan.key, product: 'kenadhr_annual_access' })
      })
    });
    res.status(201).json({ authorization_url: data.authorization_url, reference: data.reference });
  } catch (error) {
    console.error('Paystack checkout error:', error);
    res.status(error.status || 500).json({ error: error.message || 'Could not start checkout' });
  }
};

async function activateVerifiedPayment(reference) {
  const payment = await paystack(`/transaction/verify/${encodeURIComponent(reference)}`);
  if (payment.status !== 'success') { const error = new Error('Payment has not completed yet'); error.status = 409; throw error; }
  const { rows } = await db.query('SELECT * FROM company_subscriptions WHERE payment_reference=$1', [reference]);
  const subscription = rows[0];
  if (!subscription) { const error = new Error('Unknown payment reference'); error.status = 404; throw error; }
  if (Number(payment.amount) !== Number(subscription.amount) || String(payment.currency).toUpperCase() !== subscription.currency) {
    const error = new Error('Payment amount or currency did not match the selected plan'); error.status = 400; throw error;
  }
  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + YEAR_MS);
  await db.query(
    `UPDATE company_subscriptions SET status='active', starts_at=$1, ends_at=$2, paystack_customer_code=$3, updated_at=NOW() WHERE payment_reference=$4`,
    [startsAt, endsAt, payment.customer?.customer_code || null, reference]
  );
  await db.query(
    `INSERT INTO billing_payments (company_id, reference, plan_key, amount, currency, status, paid_at, provider_data)
     VALUES ($1,$2,$3,$4,$5,'success',NOW(),$6)
     ON CONFLICT (reference) DO UPDATE SET status='success', paid_at=COALESCE(billing_payments.paid_at, NOW()), provider_data=EXCLUDED.provider_data`,
    [subscription.company_id, reference, subscription.plan_key, subscription.amount, subscription.currency, payment]
  );
  return subscriptionFor(subscription.company_id);
}

exports.verify = async (req, res) => {
  try {
    if (!configured()) return res.status(503).json({ error: 'Online payments are not configured yet' });
    const reference = String(req.params.reference || '');
    const { rows } = await db.query('SELECT company_id FROM company_subscriptions WHERE payment_reference=$1', [reference]);
    if (!rows[0] || rows[0].company_id !== req.user.company_id) return res.status(404).json({ error: 'Payment was not found' });
    res.json({ subscription: await activateVerifiedPayment(reference) });
  } catch (error) { res.status(error.status || 500).json({ error: error.message || 'Could not verify payment' }); }
};

exports.webhook = async (req, res) => {
  const signature = req.get('x-paystack-signature') || '';
  const raw = req.rawBody || Buffer.from(JSON.stringify(req.body));
  const expected = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY || '').update(raw).digest('hex');
  if (!process.env.PAYSTACK_SECRET_KEY || signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }
  res.sendStatus(200);
  if (req.body?.event === 'charge.success' && req.body?.data?.reference) {
    activateVerifiedPayment(req.body.data.reference).catch((error) => console.error('Paystack webhook processing error:', error));
  }
};
