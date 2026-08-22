const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');

const db = require('../config/db');
const authController = require('../controllers/auth.controller');
const recruitmentController = require('../controllers/recruitment.controller');
const recruitmentPlatformController = require('../controllers/recruitment-platform.controller');
const employeeController = require('../controllers/employee.controller');
const documentsController = require('../controllers/documents.controller');
const leaveController = require('../controllers/leave.controller');
const attendanceController = require('../controllers/attendance.controller');
const payrollController = require('../controllers/payroll.controller');
const { calculateMonthlyPayroll } = require('../config/ghana-payroll');
const messagesController = require('../controllers/messages.controller');
const rbac = require('../middleware/rbac');
const originalGetClient = db.getClient;

function response() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    setHeader(name, value) { this.headers[name] = value; },
    send(body) { this.body = body; return this; }
  };
}

function mockQueries(results) {
  const calls = [];
  db.query = async (text, params) => {
    calls.push({ text, params });
    const next = results.shift();
    if (next instanceof Error) throw next;
    return next || { rows: [], rowCount: 0 };
  };
  return calls;
}

test.afterEach(() => {
  db.query = () => { throw new Error('Database mock missing'); };
  db.getClient = originalGetClient;
});

test('Ghana payroll calculates SSNIT and graduated PAYE from monthly pay', () => {
  const result = calculateMonthlyPayroll({ basicSalary: 5000, allowances: 0 });
  assert.equal(result.ssnitEmployee, 275);
  assert.equal(result.ssnitEmployer, 650);
  assert.equal(result.payeTax, 779.75);
  assert.equal(result.deductions, 1054.75);
});

test('login returns a token and never exposes the password hash', async () => {
  const hash = await bcrypt.hash('Password123!', 4);
  mockQueries([{ rows: [{ id: 8, company_id: 1, first_name: 'Ama', last_name: 'Osei', email: 'ama@example.com', password_hash: hash, role: 'employee', department_id: 2, photo_url: null, is_active: true }] }]);
  const res = response();

  await authController.login({ body: { email: 'AMA@EXAMPLE.COM', password: 'Password123!' } }, res);

  assert.equal(res.statusCode, 200);
  assert.ok(res.body.token);
  assert.equal(res.body.user.email, 'ama@example.com');
  assert.equal('password_hash' in res.body.user, false);
});

test('HR login requires a confirmation-code service before issuing a token', async () => {
  const hash = await bcrypt.hash('Password123!', 4);
  mockQueries([{ rows: [{ id: 9, company_id: 1, first_name: 'Esi', last_name: 'Kusi', email: 'esi@example.com', password_hash: hash, role: 'admin', department_id: null, photo_url: null, phone: '0241234567', is_active: true }] }]);
  const res = response();

  const originalVynfyKey = process.env.VYNFY_API_KEY;
  delete process.env.VYNFY_API_KEY;
  try {
    await authController.login({ body: { email: 'esi@example.com', password: 'Password123!' } }, res);
  } finally {
    if (originalVynfyKey === undefined) delete process.env.VYNFY_API_KEY;
    else process.env.VYNFY_API_KEY = originalVynfyKey;
  }

  assert.equal(res.statusCode, 503);
  assert.equal(res.body.token, undefined);
  assert.match(res.body.error, /confirmation is not configured/i);
});

test('HR login accepts a stored Ghana number with an international trunk prefix', async () => {
  const hash = await bcrypt.hash('Password123!', 4);
  const calls = mockQueries([
    { rows: [{ id: 9, company_id: 1, first_name: 'Esi', last_name: 'Kusi', email: 'esi@example.com', password_hash: hash, role: 'admin', department_id: null, photo_url: null, phone: '+233 024 123 4567', is_active: true }] },
    { rows: [{ count: '0' }] },
    { rows: [] }
  ]);
  const originalVynfyKey = process.env.VYNFY_API_KEY;
  const originalFetch = global.fetch;
  process.env.VYNFY_API_KEY = 'test-key';
  global.fetch = async () => ({ ok: true, json: async () => ({ success: true }) });
  try {
    const res = response();
    await authController.login({ body: { email: 'esi@example.com', password: 'Password123!' } }, res);
    assert.equal(res.statusCode, 202);
    assert.equal(res.body.requires_otp, true);
    assert.deepEqual(calls[2].params.slice(1), [9, '233241234567']);
  } finally {
    if (originalVynfyKey === undefined) delete process.env.VYNFY_API_KEY;
    else process.env.VYNFY_API_KEY = originalVynfyKey;
    global.fetch = originalFetch;
  }
});

test('internal staff application requires an open job selection', async () => {
  const res = response();

  await recruitmentController.submitInternalApplication({
    user: { id: 8, company_id: 1, role: 'employee' },
    body: {},
    files: []
  }, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /choose an open job/i);
});

test('internal staff cannot apply twice to the same company-scoped job', async () => {
  const calls = mockQueries([
    { rows: [{ id: 31, title: 'Internal Auditor' }] },
    { rows: [{ id: 99 }] }
  ]);
  const res = response();

  await recruitmentController.submitInternalApplication({
    user: { id: 8, company_id: 4, role: 'employee' },
    body: { requisition_id: 31 },
    files: []
  }, res);

  assert.equal(res.statusCode, 409);
  assert.deepEqual(calls[0].params, [31, 4]);
  assert.match(res.body.error, /already applied/i);
});

test('internal candidate handoff reuses the existing employee profile', async () => {
  const calls = mockQueries([
    { rows: [{ id: 18, company_id: 4, applicant_employee_id: 8, hired_employee_id: null, status: 'offer-acceptance', offer_status: 'accepted', title: 'Internal Auditor' }] },
    { rows: [{ id: 8, first_name: 'Ama', last_name: 'Osei', employee_code: 'EMP-008' }] },
    { rows: [] },
    { rows: [] }
  ]);
  const res = response();

  await recruitmentController.hireCandidate({ user: { company_id: 4 }, params: { id: 18 } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.internal_transfer, true);
  assert.equal(calls.some(call => /INSERT INTO employees/.test(call.text)), false);
  assert.ok(calls.some(call => /UPDATE employees SET job_title/.test(call.text)));
});

test('recruitment dashboard report includes vacancies, offers, and upcoming interviews', async () => {
  const calls = mockQueries([
    { rows: [] },
    { rows: [{ applicants: 12, hired: 3, avg_days_in_pipeline: 9 }] },
    { rows: [{ status: 'screening', count: 4 }] },
    { rows: [] }, { rows: [] },
    { rows: [{ total: 5, ongoing: 2 }] },
    { rows: [{ total: 3, accepted: 1 }] },
    { rows: [{ id: 4, candidate_name: 'Adwoa Mensah', requisition_title: 'Accountant' }] }
  ]);
  const res = response();

  await recruitmentController.getReport({ user: { company_id: 4 } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.vacancies.ongoing, 2);
  assert.equal(res.body.offers.accepted, 1);
  assert.equal(res.body.upcoming_interviews[0].candidate_name, 'Adwoa Mensah');
  assert.ok(calls.some(call => /candidate_interviews/.test(call.text)));
});

test('recruitment requests are numbered after creation', async () => {
  const calls = mockQueries([
    { rows: [{ id: 41, title: 'Payroll Officer' }] },
    { rows: [{ id: 41, request_number: 'RR-000041', title: 'Payroll Officer' }] }
  ]);
  const res = response();

  await recruitmentPlatformController.createRequest({
    user: { id: 8, company_id: 4 },
    body: { title: 'Payroll Officer', headcount: 1, status: 'draft' }
  }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.request_number, 'RR-000041');
  assert.ok(calls.some(call => /INSERT INTO recruitment_requests/.test(call.text)));
});

test('candidate stage changes record immutable pipeline history', async () => {
  const calls = mockQueries([
    { rows: [] },
    { rows: [{ id: 3 }] },
    { rows: [{ status: 'screening' }] },
    { rows: [{ id: 21, status: 'shortlisted' }] },
    { rows: [] }
  ]);
  const res = response();

  await recruitmentController.updateStatus({
    user: { id: 9, company_id: 4 },
    params: { id: 21 },
    body: { status: 'shortlisted', note: 'Meets the essential criteria' }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, 'shortlisted');
  assert.ok(calls.some(call => /INSERT INTO candidate_stage_events/.test(call.text)));
});

test('RBAC denies an employee from an admin-only route', () => {
  const res = response();
  let nextCalled = false;
  rbac('admin')({ user: { role: 'employee' } }, res, () => { nextCalled = true; });
  assert.equal(res.statusCode, 403);
  assert.equal(nextCalled, false);
});

test('first-time setup creates the initial HR admin and signs them in', async () => {
  const calls = [];
  const results = [
    { rows: [] }, // begin
    { rows: [{ id: 1, name: 'KenadHR', slug: 'kenadhr-test' }] },
    { rows: [{ id: 1, company_id: 1, first_name: 'Adwoa', last_name: 'Mensah', email: 'adwoa@kenadhr.com', role: 'admin', department_id: null, photo_url: null, is_active: true }] }
  ];
  db.getClient = async () => ({
    query: async (text, params) => { calls.push({ text, params }); return results.shift() || { rows: [] }; },
    release() { calls.push({ text: 'RELEASE' }); }
  });
  const res = response();
  await authController.setup({ body: { company_name: 'KenadHR', full_name: 'Adwoa Mensah', email: 'adwoa@kenadhr.com', password: 'Password123!', plan_key: 'starter' } }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.user.role, 'admin');
  assert.ok(res.body.token);
  assert.ok(calls.some(call => /INSERT INTO companies/.test(call.text)));
  assert.ok(calls.some(call => /INSERT INTO employees/.test(call.text)));
});

test('employee creation rejects unsupported employment types', async () => {
  const res = response();
  await employeeController.create({
    user: { company_id: 1 },
    body: { first_name: 'Kojo', last_name: 'Asare', email: 'kojo@example.com', password: 'Password123!', employment_type: 'temporary' }
  }, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /employment type/i);
});

test('avatar upload stores image bytes in the database', async () => {
  const calls = mockQueries([{ rows: [] }]);
  const res = response();
  const image = Buffer.from('image-bytes');
  await employeeController.uploadPhoto({
    user: { id: 7, company_id: 1 },
    file: { buffer: image, mimetype: 'image/png' }
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.photo_url, '/api/employees/photo/7');
  assert.equal(calls[0].params[1], image);
  assert.equal(calls[0].params[2], 'image/png');
});

test('department manager updates are scoped to an active employee in the same company', async () => {
  const calls = mockQueries([
    { rows: [{ id: 12 }] },
    { rows: [] },
    { rows: [{ id: 4, name: 'Operations', manager_id: 12 }] }
  ]);
  const res = response();

  await employeeController.updateDepartment({
    params: { id: '4' },
    body: { name: 'Operations', manager_id: '12' },
    user: { company_id: 3 }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.manager_id, 12);
  assert.match(calls[0].text, /FROM employees WHERE id=\$1 AND company_id=\$2 AND is_active=true/i);
  assert.deepEqual(calls[2].params, ['Operations', 12, 4, 3]);
});

test('document upload saves the supplied document title', async () => {
  const calls = mockQueries([{ rows: [{ id: 3, title: 'Signed employment contract' }] }]);
  const res = response();
  await documentsController.upload({
    body: { doc_type: 'contract', title: 'Signed employment contract', share_with_hr: 'true' },
    file: { filename: 'contract.pdf', originalname: 'contract.pdf', size: 1200 },
    user: { id: 7, company_id: 1, role: 'employee' }
  }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.title, 'Signed employment contract');
  assert.match(calls[0].text, /title, file_path/i);
  assert.equal(calls[0].params[3], 'Signed employment contract');
});

test('message edits are restricted to the sender in the same company', async () => {
  const calls = mockQueries([{ rows: [{ id: 21, sender_id: 7, body: 'Updated note' }] }]);
  const res = response();
  await messagesController.update({
    body: { body: 'Updated note' },
    params: { id: 21 },
    user: { id: 7, company_id: 3 }
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.body, 'Updated note');
  assert.match(calls[0].text, /sender_id=\$4/i);
  assert.deepEqual(calls[0].params, ['Updated note', 21, 3, 7]);
});

test('message deletion only removes a sent message owned by the user', async () => {
  const calls = mockQueries([{ rows: [{ id: 21 }] }]);
  const res = response();
  await messagesController.remove({ params: { id: 21 }, user: { id: 7, company_id: 3 } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.id, 21);
  assert.match(calls[0].text, /DELETE FROM messages/i);
  assert.match(calls[0].text, /sender_id=\$3/i);
});

test('HR payroll updates keep tax and other deductions as separate inputs', async () => {
  const calls = mockQueries([{ rows: [{ id: 9, tax: '120.00', other_deductions: '30.00', deductions: '150.00' }] }]);
  const res = response();
  await payrollController.updatePayroll({
    params: { id: 9 },
    body: { base_salary: 1200, allowances: 80, tax: 120, other_deductions: 30, status: 'processed' },
    user: { company_id: 3 }
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.deductions, '150.00');
  assert.match(calls[0].text, /tax=\$3/i);
  assert.deepEqual(calls[0].params, [1200, 80, 120, 30, 150, 'processed', 9, 3]);
});

test('leave approval rejects self-approval before modifying data', async () => {
  const calls = mockQueries([{ rows: [{ id: 15, employee_id: 7, employee_role: 'employee', status: 'pending', company_id: 1 }] }]);
  const res = response();
  await leaveController.updateStatus({ params: { id: '15' }, body: { status: 'approved' }, user: { id: 7, company_id: 1, role: 'manager' } }, res);
  assert.equal(res.statusCode, 403);
  assert.equal(calls.length, 1);
});

test('clock-in creates a present attendance record', async () => {
  const calls = mockQueries([
    { rows: [] },
    { rows: [{ is_late: false }] },
    { rows: [{ id: 9, employee_id: 7, status: 'present' }] }
  ]);
  const res = response();
  await attendanceController.clockIn({
    user: { id: 7, company_id: 1 },
    body: { latitude: 5.603717, longitude: -0.186964, accuracy_meters: 12 }
  }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.id, 9);
  assert.match(calls[2].text, /INSERT INTO attendance/);
  assert.deepEqual(calls[2].params.slice(-3), [5.603717, -0.186964, 12]);
});

test('attendance settings save late and overtime cutoffs with the overtime rate', async () => {
  const calls = mockQueries([{ rows: [{ company_id: 1, hourly_rate: '25.00', late_clock_in_after: '09:15:00', late_clock_out_after: '18:00:00' }] }]);
  const res = response();

  await attendanceController.updateOvertimeSettings({
    body: { hourly_rate: 25, late_clock_in_after: '09:15', late_clock_out_after: '18:00' },
    user: { company_id: 1 }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.match(calls[0].text, /late_clock_in_after/i);
  assert.deepEqual(calls[0].params, [1, 25, '09:15', '18:00']);
});

test('today attendance prioritizes an open overnight shift', async () => {
  const overnightShift = {
    id: 14,
    employee_id: 7,
    work_date: '2026-08-16',
    clock_in: '2026-08-16T22:00:00.000Z',
    clock_out: null,
    status: 'present'
  };
  const calls = mockQueries([{ rows: [overnightShift] }]);
  const res = response();

  await attendanceController.getToday({ user: { id: 7, company_id: 1 } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.id, 14);
  assert.match(calls[0].text, /ORDER BY \(clock_in IS NOT NULL AND clock_out IS NULL\) DESC/i);
});

test('HR attendance export produces a CSV scoped to its company', async () => {
  const calls = mockQueries([{ rows: [{
    work_date: '2026-07-16', employee_name: 'Ama Osei', email: 'ama@example.com',
    job_title: 'Designer', department_name: 'Product', clock_in: '2026-07-16T09:05:00.000Z', clock_out: null, status: 'present'
  }] }]);
  const res = response();
  await attendanceController.exportReport({ query: { date: '2026-07-16' }, user: { company_id: 7, role: 'admin' } }, res);
  assert.equal(res.headers['Content-Type'], 'text/csv; charset=utf-8');
  assert.match(res.headers['Content-Disposition'], /kenadhr-attendance-2026-07-16\.csv/);
  assert.match(res.body, /Ama Osei/);
  assert.match(res.body, /09:05/);
  assert.doesNotMatch(res.body, /T09:05:00\.000Z/);
  assert.deepEqual(calls[0].params, [7, '2026-07-16']);
});

test('payroll processing creates payroll and notification records for each active employee', async () => {
  const calls = mockQueries([
    { rows: [{ id: 4, salary: 4000 }, { id: 5, salary: 5000 }] },
    { rows: [] }, { rows: [] }, { rows: [] }, { rows: [] }
  ]);
  const res = response();
  await payrollController.processMonth({ body: { month: 7, year: 2026 }, user: { company_id: 1, role: 'admin' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.count, 2);
  assert.equal(calls.filter(call => /INSERT INTO payroll/.test(call.text)).length, 2);
  assert.equal(calls.filter(call => /INSERT INTO notifications/.test(call.text)).length, 2);
});
