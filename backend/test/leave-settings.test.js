const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const db = require('../config/db');
const leaveController = require('../controllers/leave.controller');
const leaveRouter = require('../routes/leave.routes');

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

function mockQueries(results, scheduleRows = []) {
  const calls = [];
  db.query = async (text, params) => {
    calls.push({ text, params });
    if (/FROM companies company/i.test(text)) return { rows: scheduleRows };
    const next = results.shift();
    if (next instanceof Error) throw next;
    return next || { rows: [], rowCount: 0 };
  };
  return calls;
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

function policy(overrides = {}) {
  const countNonWorkingDays = Object.prototype.hasOwnProperty.call(overrides, 'count_non_working_days')
    ? overrides.count_non_working_days
    : Object.prototype.hasOwnProperty.call(overrides, 'count_weekends')
      ? overrides.count_weekends
      : true;
  return {
    annual_entitlement_days: 20,
    count_non_working_days: countNonWorkingDays,
    count_weekends: countNonWorkingDays,
    count_public_holidays: true,
    working_days: [1, 2, 3, 4, 5],
    max_consecutive_days: null,
    minimum_notice_days: 0,
    updated_at: null,
    ...overrides
  };
}

test.afterEach(() => {
  db.query = originalQuery;
  db.getClient = originalGetClient;
  console.error = originalConsoleError;
});

test('leave settings return backwards-compatible defaults and stay company scoped', async () => {
  const calls = mockQueries([{ rows: [] }]);
  const res = response();

  await leaveController.getSettings({ user: { company_id: 44, role: 'admin' } }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, policy());
  assert.match(calls[0].text, /FROM company_leave_settings WHERE company_id=\$1/i);
  assert.deepEqual(calls[0].params, [44]);
  assert.match(calls[1].text, /FROM companies company/i);
  assert.deepEqual(calls[1].params, [44]);
});

test('leave settings preserve strict false values and audit the company-scoped upsert', async () => {
  const saved = policy({
    annual_entitlement_days: '24',
    count_weekends: false,
    count_public_holidays: false,
    max_consecutive_days: '10',
    minimum_notice_days: '7',
    updated_at: '2026-09-07T12:00:00.000Z'
  });
  const { calls, client } = mockTransaction((text) => {
    if (/INSERT INTO company_leave_settings/i.test(text)) return { rows: [saved] };
    return { rows: [] };
  });
  const res = response();

  await leaveController.updateSettings({
    user: { id: 9, company_id: 44, role: 'admin' },
    body: {
      annual_entitlement_days: 24,
      count_weekends: false,
      count_public_holidays: 'false',
      max_consecutive_days: 10,
      minimum_notice_days: 7
    }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, policy({
    annual_entitlement_days: 24,
    count_weekends: false,
    count_public_holidays: false,
    max_consecutive_days: 10,
    minimum_notice_days: 7,
    updated_at: '2026-09-07T12:00:00.000Z'
  }));
  const upsert = calls.find((call) => /INSERT INTO company_leave_settings/i.test(call.text));
  const audit = calls.find((call) => /INSERT INTO audit_logs/i.test(call.text));
  assert.deepEqual(upsert.params, [44, 24, false, false, 10, 7, 9]);
  assert.deepEqual(audit.params.slice(0, 2), [44, 9]);
  assert.match(audit.params[2], /maximum per request 10/i);
  assert.match(audit.params[2], /minimum notice 7 days/i);
  assert.ok(calls.indexOf(audit) < calls.findIndex((call) => call.text === 'COMMIT'));
  assert.equal(client.released, true);
});

test('leave settings accept the non-working-day alias and return both API names', async () => {
  const saved = policy({ count_non_working_days: false, count_public_holidays: true });
  const { calls } = mockTransaction((text) => {
    if (/INSERT INTO company_leave_settings/i.test(text)) return { rows: [saved] };
    if (/FROM companies company/i.test(text)) return { rows: [{ id: 22, weekdays: [0, 2, 4] }] };
    return { rows: [] };
  });
  const res = response();

  await leaveController.updateSettings({
    user: { id: 9, company_id: 44, role: 'admin' },
    body: {
      annual_entitlement_days: 20,
      count_non_working_days: false,
      count_public_holidays: true,
      max_consecutive_days: null,
      minimum_notice_days: 0
    }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.count_non_working_days, false);
  assert.equal(res.body.count_weekends, false);
  assert.deepEqual(res.body.working_days, [0, 2, 4]);
  const upsert = calls.find((call) => /INSERT INTO company_leave_settings/i.test(call.text));
  assert.equal(upsert.params[2], false);
});

test('leave settings reject conflicting legacy and non-working-day rules before writing', async () => {
  let opened = false;
  db.getClient = async () => { opened = true; throw new Error('must not open'); };
  const res = response();

  await leaveController.updateSettings({
    user: { id: 9, company_id: 44, role: 'admin' },
    body: {
      annual_entitlement_days: 20,
      count_non_working_days: false,
      count_weekends: true,
      count_public_holidays: true,
      max_consecutive_days: null,
      minimum_notice_days: 0
    }
  }, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /conflicting non-working-day rules/i);
  assert.equal(opened, false);
});

test('leave settings reject invalid policy values before opening a transaction', async () => {
  let opened = false;
  db.getClient = async () => { opened = true; throw new Error('must not open'); };
  const res = response();

  await leaveController.updateSettings({
    user: { id: 9, company_id: 44, role: 'admin' },
    body: {
      annual_entitlement_days: 20,
      count_weekends: 'sometimes',
      count_public_holidays: true,
      max_consecutive_days: 21,
      minimum_notice_days: 0
    }
  }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(opened, false);
});

test('leave settings roll back and release the transaction when auditing fails', async () => {
  console.error = () => {};
  const failure = new Error('audit unavailable');
  const { calls, client } = mockTransaction((text) => {
    if (/INSERT INTO company_leave_settings/i.test(text)) return { rows: [policy()] };
    if (/INSERT INTO audit_logs/i.test(text)) throw failure;
    return { rows: [] };
  });
  const res = response();

  await leaveController.updateSettings({
    user: { id: 9, company_id: 44, role: 'admin' },
    body: policy()
  }, res);

  assert.equal(res.statusCode, 500);
  assert.ok(calls.some((call) => call.text === 'ROLLBACK'));
  assert.equal(client.released, true);
});

test('leave balance uses the configured entitlement and day-count rules', async () => {
  const calls = mockQueries([
    { rows: [policy({ annual_entitlement_days: 25, count_weekends: false, count_public_holidays: false })] },
    { rows: [{ used: 7, pending: 2 }] }
  ]);
  const res = response();

  await leaveController.getMyBalance({
    user: { id: 8, company_id: 44 },
    query: { year: '2026' }
  }, res);

  assert.deepEqual(res.body, {
    year: 2026,
    entitlement: 25,
    used: 7,
    pending: 2,
    available: 16,
    count_non_working_days: false,
    count_weekends: false,
    count_public_holidays: false,
    working_days: [1, 2, 3, 4, 5]
  });
  const balanceQuery = calls.find((call) => /FROM leave_requests request/i.test(call.text));
  assert.match(balanceQuery.text, /generate_series/i);
  assert.match(balanceQuery.text, /company_calendar_events/i);
  assert.match(balanceQuery.text, /FILTER \(WHERE request\.status='approved'\)/i);
  assert.match(balanceQuery.text, /FILTER \(WHERE request\.status='pending'\)/i);
  assert.deepEqual(balanceQuery.params, [44, 8, 2026, false, false, [1, 2, 3, 4, 5]]);
  assert.equal(calls.length, 3);
});

test('leave request listing exposes the configured annual balance calculation', async () => {
  const calls = mockQueries([
    { rows: [policy({ annual_entitlement_days: 30, count_weekends: false, count_public_holidays: false })] },
    { rows: [] }
  ]);
  const res = response();

  await leaveController.getAll({
    user: { id: 9, company_id: 44, role: 'manager' },
    query: {}
  }, res);

  assert.equal(res.statusCode, 200);
  const listingQuery = calls.find((call) => /SELECT lr\.\*, CONCAT\(e\.first_name/i.test(call.text));
  assert.deepEqual(listingQuery.params, [44, 30, false, false, [1, 2, 3, 4, 5]]);
  assert.match(listingQuery.text, /\$2::int AS annual_entitlement/i);
  assert.match(listingQuery.text, /EXTRACT\(DOW FROM leave_day\)::int = ANY\(\$5::smallint\[\]\)/i);
  assert.match(listingQuery.text, /employees e\s+ON e\.id = lr\.employee_id AND e\.company_id=lr\.company_id/i);
});

test('annual leave request enforces minimum notice before counting days', async () => {
  const { calls, client } = mockTransaction((text) => {
    if (/FROM company_leave_settings/i.test(text)) return { rows: [policy({ minimum_notice_days: 5 })] };
    return { rows: [] };
  });
  const res = response();

  await leaveController.request({
    user: { id: 8, company_id: 44, role: 'employee', first_name: 'Ama', last_name: 'Mensah' },
    body: { leave_type: 'annual', start_date: '2000-02-01', end_date: '2000-02-02', reason: 'Rest' }
  }, res);

  assert.equal(res.statusCode, 409);
  assert.match(res.body.error, /at least 5 day\(s\) notice/i);
  assert.match(calls[1].text, /pg_advisory_xact_lock/i);
  assert.equal(calls.at(-1).text, 'ROLLBACK');
  assert.equal(client.released, true);
});

test('annual leave request enforces configured counted-day maximum before reserving balance', async () => {
  const { calls } = mockTransaction((text) => {
    if (/FROM company_leave_settings/i.test(text)) return { rows: [policy({ count_weekends: false, count_public_holidays: false, max_consecutive_days: 3 })] };
    if (/FROM generate_series/i.test(text)) return { rows: [{ days: 4 }] };
    return { rows: [] };
  });
  const res = response();

  await leaveController.request({
    user: { id: 8, company_id: 44, role: 'employee', first_name: 'Ama', last_name: 'Mensah' },
    body: { leave_type: 'annual', start_date: '2099-01-05', end_date: '2099-01-12', reason: 'Rest' }
  }, res);

  assert.equal(res.statusCode, 409);
  assert.match(res.body.error, /limited to 3 chargeable/i);
  const dayCount = calls.find((call) => /FROM generate_series/i.test(call.text));
  assert.deepEqual(dayCount.params, [44, '2099-01-05', '2099-01-12', false, false, [1, 2, 3, 4, 5]]);
  assert.equal(calls.at(-1).text, 'ROLLBACK');
});

test('annual leave request applies the configured entitlement to approved and pending days', async () => {
  let generatedSeriesCalls = 0;
  const { calls } = mockTransaction((text) => {
    if (/FROM company_leave_settings/i.test(text)) return { rows: [policy({ annual_entitlement_days: 5 })] };
    if (/generate_series/i.test(text)) {
      generatedSeriesCalls += 1;
      return { rows: [{ days: generatedSeriesCalls === 1 ? 2 : 4 }] };
    }
    return { rows: [] };
  });
  const res = response();

  await leaveController.request({
    user: { id: 8, company_id: 44, role: 'employee', first_name: 'Ama', last_name: 'Mensah' },
    body: { leave_type: 'annual', start_date: '2099-02-01', end_date: '2099-02-02', reason: 'Rest' }
  }, res);

  assert.equal(res.statusCode, 409);
  assert.match(res.body.error, /1 day\(s\) remain/i);
  const reservedCount = calls.find((call) => /FROM leave_requests request/i.test(call.text));
  assert.deepEqual(reservedCount.params, [44, 8, ['pending', 'approved'], 2099, true, true, [1, 2, 3, 4, 5]]);
  assert.equal(calls.at(-1).text, 'ROLLBACK');
});

test('annual leave approval rechecks the company policy before modifying the request', async () => {
  const { calls, client } = mockTransaction((text) => {
    if (/SELECT lr\.\*, e\.role AS employee_role/i.test(text)) {
      return { rows: [{ id: 15, employee_id: 8, employee_role: 'employee', leave_type: 'annual', status: 'pending', start_date: new Date(2026, 9, 1), end_date: new Date(2026, 9, 3) }] };
    }
    if (/FROM company_leave_settings/i.test(text)) return { rows: [policy({ annual_entitlement_days: 5, count_weekends: false })] };
    if (/FROM leave_requests request/i.test(text)) return { rows: [{ days: 4 }] };
    if (/FROM generate_series/i.test(text)) return { rows: [{ days: 3 }] };
    return { rows: [] };
  });
  const res = response();

  await leaveController.updateStatus({
    params: { id: '15' },
    body: { status: 'approved' },
    user: { id: 9, company_id: 44, role: 'admin' }
  }, res);

  assert.equal(res.statusCode, 409);
  assert.match(res.body.error, /only 1 annual leave day/i);
  const leaveLookup = calls.find((call) => /SELECT lr\.\*, e\.role AS employee_role/i.test(call.text));
  const dayCount = calls.find((call) => /FROM generate_series/i.test(call.text));
  const approvedCount = calls.find((call) => /FROM leave_requests request/i.test(call.text));
  assert.equal(leaveLookup.params[1], 44);
  assert.match(leaveLookup.text, /FOR UPDATE OF lr/i);
  assert.deepEqual(dayCount.params.slice(1, 3), ['2026-10-01', '2026-10-03']);
  assert.deepEqual(approvedCount.params, [44, 8, ['approved'], 2026, false, true, [1, 2, 3, 4, 5]]);
  assert.equal(calls.at(-1).text, 'ROLLBACK');
  assert.equal(client.released, true);
});

test('leave requests serialize checks and creation in one transaction', async () => {
  const created = {
    id: 16,
    employee_id: 8,
    leave_type: 'annual',
    start_date: '2099-03-02',
    end_date: '2099-03-02',
    status: 'pending'
  };
  const { calls, client } = mockTransaction((text) => {
    if (/FROM company_leave_settings/i.test(text)) return { rows: [policy()] };
    if (/FROM leave_requests request/i.test(text)) return { rows: [{ days: 0 }] };
    if (/FROM generate_series/i.test(text)) return { rows: [{ days: 1 }] };
    if (/SELECT id FROM leave_requests/i.test(text)) return { rows: [] };
    if (/INSERT INTO leave_requests/i.test(text)) return { rows: [created] };
    if (/SELECT id FROM employees/i.test(text)) return { rows: [] };
    return { rows: [] };
  });
  const res = response();

  await leaveController.request({
    user: { id: 8, company_id: 44, role: 'employee', first_name: 'Ama', last_name: 'Mensah' },
    body: { leave_type: 'annual', start_date: '2099-03-02', end_date: '2099-03-02', reason: 'Rest' }
  }, res);

  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.body, created);
  assert.equal(calls[0].text, 'BEGIN');
  assert.match(calls[1].text, /pg_advisory_xact_lock/i);
  assert.ok(calls.findIndex((call) => /INSERT INTO leave_requests/i.test(call.text)) < calls.findIndex((call) => call.text === 'COMMIT'));
  assert.equal(calls.at(-1).text, 'COMMIT');
  assert.equal(client.released, true);
});

test('leave approval rolls back the status when attendance creation fails', async () => {
  console.error = () => {};
  const { calls, client } = mockTransaction((text) => {
    if (/SELECT lr\.\*, e\.role AS employee_role/i.test(text)) {
      return { rows: [{ id: 17, employee_id: 8, employee_role: 'employee', leave_type: 'sick', status: 'pending', start_date: '2026-10-01', end_date: '2026-10-02' }] };
    }
    if (/UPDATE leave_requests SET status/i.test(text)) {
      return { rows: [{ id: 17, employee_id: 8, leave_type: 'sick', status: 'approved' }] };
    }
    if (/INSERT INTO attendance/i.test(text)) throw new Error('attendance unavailable');
    return { rows: [] };
  });
  const res = response();

  await leaveController.updateStatus({
    params: { id: '17' },
    body: { status: 'approved' },
    user: { id: 9, company_id: 44, role: 'admin' }
  }, res);

  assert.equal(res.statusCode, 500);
  const update = calls.find((call) => /UPDATE leave_requests SET status/i.test(call.text));
  assert.match(update.text, /AND status='pending'/i);
  assert.equal(calls.some((call) => call.text === 'COMMIT'), false);
  assert.equal(calls.at(-1).text, 'ROLLBACK');
  assert.equal(client.released, true);
});

test('non-annual approval creates attendance only on the selected company working days', async () => {
  const outsideCalls = [];
  db.query = async (text, params) => {
    outsideCalls.push({ text, params });
    return { rows: [] };
  };
  const approved = {
    id: 18,
    employee_id: 8,
    leave_type: 'sick',
    status: 'approved',
    start_date: '2026-10-01',
    end_date: '2026-10-05'
  };
  const { calls, client } = mockTransaction((text) => {
    if (/SELECT lr\.\*, e\.role AS employee_role/i.test(text)) {
      return { rows: [{ ...approved, status: 'pending', employee_role: 'employee' }] };
    }
    if (/FROM company_leave_settings/i.test(text)) return { rows: [policy()] };
    if (/FROM companies company/i.test(text)) return { rows: [{ id: 12, weekdays: [2, 4, 6] }] };
    if (/UPDATE leave_requests SET status/i.test(text)) return { rows: [approved] };
    return { rows: [] };
  });
  const res = response();

  await leaveController.updateStatus({
    params: { id: '18' },
    body: { status: 'approved' },
    user: { id: 9, company_id: 44, role: 'admin' }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, approved);
  const attendance = calls.find((call) => /INSERT INTO attendance/i.test(call.text));
  assert.ok(attendance, 'attendance insertion is missing');
  assert.match(attendance.text, /EXTRACT\(DOW FROM leave_day\)::int = ANY\(\$5::smallint\[\]\)/i);
  assert.doesNotMatch(attendance.text, /NOT IN \(0,6\)/i);
  assert.deepEqual(attendance.params, [44, 8, '2026-10-01', '2026-10-05', [2, 4, 6], true]);
  assert.equal(calls.at(-1).text, 'COMMIT');
  assert.equal(client.released, true);
  assert.match(outsideCalls[0].text, /INSERT INTO notifications/i);
});

test('leave settings routes require the admin RBAC middleware', () => {
  for (const method of ['get', 'put']) {
    const layer = leaveRouter.stack.find((item) => item.route?.path === '/settings' && item.route.methods[method]);
    assert.ok(layer, `${method.toUpperCase()} /settings route is missing`);
    assert.equal(layer.route.stack.length, 3);
    const res = response();
    let continued = false;
    layer.route.stack[1].handle({ user: { role: 'manager' } }, res, () => { continued = true; });
    assert.equal(res.statusCode, 403);
    assert.equal(continued, false);
  }
});

test('leave settings migration defines guarded company-scoped defaults', () => {
  const migration = fs.readFileSync(
    path.join(__dirname, '..', '..', 'database', 'migrations', '073_company_leave_settings.sql'),
    'utf8'
  );
  assert.match(migration, /company_id INT PRIMARY KEY REFERENCES companies\(id\) ON DELETE CASCADE/i);
  assert.match(migration, /annual_entitlement_days INT NOT NULL DEFAULT 20/i);
  assert.match(migration, /count_weekends BOOLEAN NOT NULL DEFAULT true/i);
  assert.match(migration, /count_public_holidays BOOLEAN NOT NULL DEFAULT true/i);
  assert.match(migration, /max_consecutive_days IS NULL OR max_consecutive_days <= annual_entitlement_days/i);
});
