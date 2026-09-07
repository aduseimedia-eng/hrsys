const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const db = require('../config/db');
const companyController = require('../controllers/company.controller');
const schedulesController = require('../controllers/schedules.controller');
const schedulesRouter = require('../routes/schedules.routes');

const originalQuery = db.query;
const originalGetClient = db.getClient;
const originalConsoleError = console.error;

function response() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

function mockTransaction(handler) {
  const calls = [];
  const client = {
    released: false,
    async query(text, params) {
      calls.push({ text, params });
      return handler(text, params, calls);
    },
    release() { this.released = true; }
  };
  db.getClient = async () => client;
  return { calls, client };
}

test.afterEach(() => {
  db.query = originalQuery;
  db.getClient = originalGetClient;
  console.error = originalConsoleError;
});

test('default schedule falls back to Monday-Friday and remains company scoped', async () => {
  const calls = [];
  db.query = async (text, params) => {
    calls.push({ text, params });
    return { rows: [] };
  };
  const res = response();

  await schedulesController.getDefault({ user: { id: 8, company_id: 44, role: 'employee' } }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    id: null,
    name: 'Standard workweek',
    start_time: '09:00:00',
    end_time: '17:30:00',
    break_minutes: 0,
    weekdays: [1, 2, 3, 4, 5],
    working_days: [1, 2, 3, 4, 5],
    is_default: true,
    source: 'fallback'
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0].text, /WHERE company\.id=\$1/i);
  assert.match(calls[0].text, /WHERE company_id=company\.id AND is_default=true/i);
  assert.deepEqual(calls[0].params, [44]);
});

test('default schedule honors an existing company work-week until HR saves a schedule', async () => {
  db.query = async () => ({ rows: [{ work_week: 'Sunday-Thursday' }] });
  const res = response();

  await schedulesController.getDefault({ user: { id: 8, company_id: 44, role: 'employee' } }, res);

  assert.deepEqual(res.body.working_days, [0, 1, 2, 3, 4]);
  assert.equal(res.body.source, 'company_profile');
});

test('admin default update normalizes days and commits the company-scoped audit transaction', async () => {
  const saved = {
    id: 27,
    company_id: 44,
    name: 'Operations',
    start_time: '08:00:00',
    end_time: '17:00:00',
    break_minutes: 45,
    weekdays: [1, 3, 6],
    is_default: true
  };
  const { calls, client } = mockTransaction((text) => {
    if (/SELECT id FROM work_schedules/i.test(text)) return { rows: [{ id: 27 }] };
    if (/UPDATE work_schedules SET weekdays/i.test(text)) return { rows: [saved] };
    return { rows: [] };
  });
  const res = response();

  await schedulesController.updateDefault({
    user: { id: 9, company_id: 44, role: 'admin' },
    body: { working_days: [6, 1, 3, 1] }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.working_days, [1, 3, 6]);
  assert.deepEqual(res.body.weekdays, [1, 3, 6]);
  assert.equal(calls[0].text, 'BEGIN');
  assert.match(calls[1].text, /pg_advisory_xact_lock/i);
  assert.deepEqual(calls[1].params, [44]);
  const lookup = calls.find((call) => /SELECT id FROM work_schedules/i.test(call.text));
  const clearOthers = calls.find((call) => /SET is_default=false/i.test(call.text));
  const update = calls.find((call) => /SET weekdays=\$1/i.test(call.text));
  const company = calls.find((call) => /UPDATE companies SET work_week/i.test(call.text));
  const audit = calls.find((call) => /INSERT INTO audit_logs/i.test(call.text));
  assert.deepEqual(lookup.params, [44]);
  assert.deepEqual(clearOthers.params, [44, 27]);
  assert.deepEqual(update.params, [[1, 3, 6], 27, 44]);
  assert.deepEqual(company.params, ['Mon,Wed,Sat', 44]);
  assert.deepEqual(audit.params.slice(0, 3), [44, 9, 27]);
  assert.match(audit.params[3], /Mon,Wed,Sat/);
  assert.ok(calls.indexOf(audit) < calls.findIndex((call) => call.text === 'COMMIT'));
  assert.equal(calls.at(-1).text, 'COMMIT');
  assert.equal(client.released, true);
});

test('default update rejects missing, empty, or invalid working-day input before opening a transaction', async (t) => {
  for (const workingDays of [undefined, [], [7], [-1, 1], ['1'], ['Monday'], [true], [null], [1.5]]) {
    await t.test(String(workingDays), async () => {
      let opened = false;
      db.getClient = async () => { opened = true; throw new Error('must not open'); };
      const res = response();

      await schedulesController.updateDefault({
        user: { id: 9, company_id: 44, role: 'admin' },
        body: workingDays === undefined ? {} : { working_days: workingDays }
      }, res);

      assert.equal(res.statusCode, 400);
      assert.match(res.body.error, /select at least one valid working day/i);
      assert.equal(opened, false);
    });
  }
});

test('default update rolls back and releases its transaction when auditing fails', async () => {
  console.error = () => {};
  const failure = new Error('audit unavailable');
  const { calls, client } = mockTransaction((text) => {
    if (/SELECT id FROM work_schedules/i.test(text)) return { rows: [] };
    if (/INSERT INTO work_schedules/i.test(text)) {
      return { rows: [{ id: 31, company_id: 44, weekdays: [1, 2, 3, 4, 5], is_default: true }] };
    }
    if (/INSERT INTO audit_logs/i.test(text)) throw failure;
    return { rows: [] };
  });
  const res = response();

  await schedulesController.updateDefault({
    user: { id: 9, company_id: 44, role: 'admin' },
    body: { weekdays: [1, 2, 3, 4, 5] }
  }, res);

  assert.equal(res.statusCode, 500);
  assert.equal(calls.some((call) => call.text === 'COMMIT'), false);
  assert.equal(calls.at(-1).text, 'ROLLBACK');
  assert.equal(client.released, true);
});

test('default schedule routes allow authenticated reads but reserve writes for admins', () => {
  const getLayer = schedulesRouter.stack.find((item) => item.route?.path === '/default' && item.route.methods.get);
  const putLayer = schedulesRouter.stack.find((item) => item.route?.path === '/default' && item.route.methods.put);
  assert.ok(getLayer, 'GET /default route is missing');
  assert.ok(putLayer, 'PUT /default route is missing');
  assert.equal(getLayer.route.stack.length, 2);
  assert.equal(putLayer.route.stack.length, 3);

  const res = response();
  let continued = false;
  putLayer.route.stack[1].handle({ user: { role: 'manager' } }, res, () => { continued = true; });
  assert.equal(res.statusCode, 403);
  assert.equal(continued, false);
});

test('generic schedule creation cannot bypass the HR default-setting endpoint', async () => {
  let queried = false;
  db.query = async () => { queried = true; return { rows: [] }; };
  const res = response();

  await schedulesController.create({
    user: { id: 12, company_id: 44, role: 'manager' },
    body: {
      name: 'Manager override',
      start_time: '08:00',
      end_time: '17:00',
      break_minutes: 30,
      weekdays: [1, 2, 3, 4, 5],
      is_default: 'true'
    }
  }, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /default schedule settings/i);
  assert.equal(queried, false);
});

test('saving the company profile preserves the schedule-derived work-week label', async () => {
  const calls = [];
  db.query = async (text, params) => {
    calls.push({ text, params });
    return { rows: [{ currency: 'GHS', work_week: 'Mon,Wed,Sat' }] };
  };
  const res = response();

  await companyController.updateSettings({
    user: { id: 9, company_id: 44, role: 'admin' },
    body: { legal_name: 'Example Ltd', timezone: 'Africa/Accra' }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.match(calls[0].text, /work_week=COALESCE\(\$9,work_week\)/i);
  assert.equal(calls[0].params[8], null);
});

test('working-days migration sanitizes weekdays and enforces one guarded company default', () => {
  const migration = fs.readFileSync(
    path.join(__dirname, '..', '..', 'database', 'migrations', '074_company_working_days.sql'),
    'utf8'
  );

  assert.match(migration, /LOCK TABLE work_schedules IN SHARE ROW EXCLUSIVE MODE/i);
  assert.match(migration, /SET weekdays = ARRAY\[1,2,3,4,5\]::SMALLINT\[\]/i);
  assert.match(migration, /array_ndims\(weekdays\)/i);
  assert.match(migration, /ROW_NUMBER\(\) OVER \(PARTITION BY company_id ORDER BY id DESC\)/i);
  assert.match(migration, /CHECK \(array_ndims\(weekdays\) = 1[\s\S]*cardinality\(weekdays\) BETWEEN 1 AND 7/i);
  assert.match(migration, /weekdays <@ ARRAY\[0,1,2,3,4,5,6\]::SMALLINT\[\]/i);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS idx_work_schedules_one_default[\s\S]*ON work_schedules\(company_id\)[\s\S]*WHERE is_default/i);
});
