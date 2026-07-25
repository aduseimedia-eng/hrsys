const DEFAULT_PLANS = [
  { key: 'starter', name: 'Starter', amount: 120000, description: 'For small teams getting started with KenadHR.' },
  { key: 'growth', name: 'Growth', amount: 300000, description: 'For growing teams that need the full HR workspace.' },
  { key: 'business', name: 'Business', amount: 600000, description: 'For larger organisations with advanced HR needs.' }
];

function plans() {
  let configured = DEFAULT_PLANS;
  if (process.env.BILLING_PLANS) {
    try { configured = JSON.parse(process.env.BILLING_PLANS); } catch (error) {
      throw new Error('BILLING_PLANS must be valid JSON');
    }
  }

  if (!Array.isArray(configured) || !configured.length) throw new Error('At least one billing plan is required');
  return configured.map((plan) => {
    const key = String(plan.key || '').trim().toLowerCase();
    const name = String(plan.name || '').trim();
    const amount = Number(plan.amount);
    if (!/^[a-z0-9_-]+$/.test(key) || !name || !Number.isInteger(amount) || amount <= 0) {
      throw new Error('Each billing plan needs a key, name, and positive whole amount in the currency subunit');
    }
    return { key, name, amount, description: String(plan.description || '').trim() };
  });
}

function currency() { return (process.env.PAYSTACK_CURRENCY || 'GHS').toUpperCase(); }
function publicPlans() { return plans().map((plan) => ({ ...plan, currency: currency(), interval: 'yearly' })); }
function findPlan(key) { return plans().find((plan) => plan.key === String(key || '').toLowerCase()); }

module.exports = { currency, publicPlans, findPlan };
