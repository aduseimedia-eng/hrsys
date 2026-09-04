const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../config/db');
const payrollRunsController = require('../controllers/payroll-runs.controller');

const originalQuery = db.query;

test.afterEach(() => {
  db.query = originalQuery;
});

test('payroll run list serializes database dates as canonical date-only values', async () => {
  let query;
  db.query = async (text, params) => {
    query = { text, params };
    return {
      rows: [{
        id: 9,
        period_start: new Date('2026-08-31T21:00:00.000Z'),
        period_end: new Date('2026-09-29T21:00:00.000Z'),
        payment_date: new Date('2026-09-29T21:00:00.000Z'),
        period_start_iso: '2026-09-01',
        period_end_iso: '2026-09-30',
        payment_date_iso: '2026-09-30'
      }]
    };
  };
  const response = {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };

  await payrollRunsController.list({ user: { company_id: 12 } }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body[0].period_start, '2026-09-01');
  assert.equal(response.body[0].period_end, '2026-09-30');
  assert.equal(response.body[0].payment_date, '2026-09-30');
  assert.ok(!Object.hasOwn(response.body[0], 'period_start_iso'));
  assert.deepEqual(query.params, [12]);
  assert.match(query.text, /to_char\(pr\.period_start, 'YYYY-MM-DD'\) AS period_start_iso/i);
  assert.match(query.text, /to_char\(pr\.period_end, 'YYYY-MM-DD'\) AS period_end_iso/i);
  assert.match(query.text, /to_char\(pr\.payment_date, 'YYYY-MM-DD'\) AS payment_date_iso/i);
});
