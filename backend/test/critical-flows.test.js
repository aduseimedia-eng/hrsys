const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');

const db = require('../config/db');
const authController = require('../controllers/auth.controller');
const recruitmentController = require('../controllers/recruitment.controller');
const recruitmentPlatformController = require('../controllers/recruitment-platform.controller');
const employeeController = require('../controllers/employee.controller');
const companyController = require('../controllers/company.controller');
const documentsController = require('../controllers/documents.controller');
const leaveController = require('../controllers/leave.controller');
const attendanceController = require('../controllers/attendance.controller');
const payrollController = require('../controllers/payroll.controller');
const payrollRunsController = require('../controllers/payroll-runs.controller');
const financialsController = require('../controllers/financials.controller');
const { calculateMonthlyPayroll } = require('../config/ghana-payroll');
const { calculatePayroll } = require('../services/payroll-engine');
const { currencyFractionDigits, roundCurrency } = require('../config/currencies');
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

function mockTransaction(transactionResults, poolResults = []) {
  const transactionCalls = [];
  const client = {
    released: false,
    async query(text, params) {
      transactionCalls.push({ text, params });
      const next = transactionResults.shift();
      if (next instanceof Error) throw next;
      return next || { rows: [], rowCount: 0 };
    },
    release() { this.released = true; }
  };
  db.getClient = async () => client;
  const poolCalls = mockQueries(poolResults);
  return { client, poolCalls, transactionCalls };
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

test('global payroll setup is scoped to the requesting company', async () => {
  const calls = mockQueries([
    { rows: [{ iso_code: 'GH', name: 'Ghana', currency_code: 'GHS' }] },
    { rows: [{ id: 12, name: 'Kenad Ghana', country_code: 'GH' }] },
    { rows: [{ id: 18, name: 'Default monthly payroll', pay_frequency: 'monthly' }] },
    { rows: [{ active_profiles: 8, profiles_without_pay_group: 0 }] }
  ]);
  const res = response();

  await payrollController.getGlobalSetup({ user: { company_id: 77 } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.legal_entities[0].id, 12);
  assert.equal(res.body.profile_coverage.active_profiles, 8);
  assert.deepEqual(calls.slice(1).map(call => call.params), [[77], [77], [77]]);
});

test('global payroll engine delegates Ghana calculations to an effective rule set', () => {
  const payroll = calculatePayroll({
    countryCode: 'GH', basicSalary: '5000.00', allowances: '0.00', fractionDigits: 2,
    rules: [
      { code: 'GH-SSNIT', name: 'SSNIT', employee_rate: '0.055', employer_rate: '0.13', maximum_amount: '25000' },
      { code: 'GH-PAYE', name: 'PAYE', tax_brackets: [
        { lower_bound: 0, upper_bound: 490, rate: 0 }, { lower_bound: 490, upper_bound: 600, rate: '0.05' },
        { lower_bound: 600, upper_bound: 730, rate: '0.10' }, { lower_bound: 730, upper_bound: '3896.67', rate: '0.175' },
        { lower_bound: '3896.67', upper_bound: '19896.67', rate: '0.25' }, { lower_bound: '19896.67', upper_bound: '50416.67', rate: '0.30' },
        { lower_bound: '50416.67', upper_bound: null, rate: '0.35' }
      ] }
    ]
  });

  assert.equal(payroll.employeeSocialSecurity.toFixed(2), '275.00');
  assert.equal(payroll.employeeTax.toFixed(2), '779.75');
  assert.equal(payroll.netPay.toFixed(2), '3945.25');
  assert.equal(payroll.totalEmployerCost.toFixed(2), '5650.00');
});

test('global payroll run creation derives jurisdiction from a company pay group', async () => {
  const calls = mockQueries([
    { rows: [{ id: 3, legal_entity_id: 4, country_id: 1, currency_code: 'GHS' }] },
    { rows: [{ id: 91, status: 'draft', country_id: 1 }] }
  ]);
  const res = response();

  await payrollRunsController.create({
    user: { id: 5, company_id: 77 },
    body: { pay_group_id: 3, period_start: '2026-08-01', period_end: '2026-08-31', payment_date: '2026-08-28' }
  }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.id, 91);
  assert.deepEqual(calls[0].params, [3, 77]);
  assert.deepEqual(calls[1].params, [77, 4, 3, 1, 'GHS', '2026-08-01', '2026-08-31', '2026-08-28', 5]);
});

test('global payroll finalization only follows approval and is audited', async () => {
  const calls = mockQueries([{ rows: [{ id: 91, status: 'finalized' }] }, { rows: [] }]);
  const res = response();

  await payrollRunsController.transition({ user: { id: 5, company_id: 77 }, params: { id: 91 }, body: { action: 'finalize' } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, 'finalized');
  assert.deepEqual(calls[0].params, ['finalized', 5, 91, 77, 'approved']);
  assert.deepEqual(calls[1].params, [77, 5, 91, 'Finalized payroll run']);
});

test('global payroll calculation snapshots results before allowing approval', async () => {
  const { client, transactionCalls } = mockTransaction([
    {},
    { rows: [{ id: 91, company_id: 77, pay_group_id: 3, country_code: 'GH', currency_code: 'GHS', period_end: '2026-08-31', status: 'draft' }] },
    { rows: [{ employee_id: 22, salary: '5000.00' }] },
    { rows: [
      { code: 'GH-SSNIT', name: 'SSNIT', version: 'GH-2026.01', employee_rate: '0.055', employer_rate: '0.13', maximum_amount: '25000', tax_brackets: [] },
      { code: 'GH-PAYE', name: 'PAYE', version: 'GH-2026.01', tax_brackets: [{ lower_bound: 0, upper_bound: null, rate: '0.10', fixed_amount: 0 }] }
    ] },
    { rows: [{ id: 501 }] }, {}, {}, {}, {}, {},
    { rows: [{ id: 91, status: 'calculated' }] }, {}, {}
  ]);
  const res = response();

  await payrollRunsController.calculate({ user: { id: 5, company_id: 77 }, params: { id: 91 } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, 'calculated');
  assert.equal(res.body.employee_count, 1);
  assert.equal(client.released, true);
  assert.match(transactionCalls[4].text, /INSERT INTO payroll_results/);
  assert.match(transactionCalls[10].text, /UPDATE payroll_runs SET status='calculated'/);
});

test('currency precision follows each ISO currency minor unit', () => {
  assert.equal(currencyFractionDigits('JPY'), 0);
  assert.equal(currencyFractionDigits('USD'), 2);
  assert.equal(currencyFractionDigits('KWD'), 3);
  assert.equal(currencyFractionDigits('CLF'), 4);
  assert.equal(currencyFractionDigits('UYW'), 4);
  assert.equal(roundCurrency(1.23456, 'KWD'), 1.235);
  assert.equal(roundCurrency(1.23456, 'CLF'), 1.2346);
});

test('payroll compliance amounts retain the selected currency precision', () => {
  const result = calculateMonthlyPayroll({ basicSalary: 1234.567, fractionDigits: 3 });
  assert.equal(result.ssnitEmployee, 67.901);
  assert.equal(result.ssnitEmployer, 160.494);
  assert.equal(calculateMonthlyPayroll({ basicSalary: 1234.567, fractionDigits: 0 }).ssnitEmployee, 68);
  assert.equal(calculateMonthlyPayroll({ basicSalary: 1234.567, fractionDigits: 4 }).ssnitEmployee, 67.9012);
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

test('system preferences persist company defaults and an ISO currency', async () => {
  const calls = mockQueries([{ rows: [{ announcement_expiry_days: 30, default_records_per_page: 25, employee_code_prefix: 'PEP', currency: 'EUR' }] }]);
  const res = response();

  await companyController.updateSystemPreferences({
    body: { announcement_expiry_days: 30, default_records_per_page: 25, employee_code_prefix: 'PEP', currency: 'eur' },
    user: { company_id: 3 }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.currency, 'EUR');
  assert.match(calls[0].text, /announcement_expiry_days/i);
  assert.match(calls[0].text, /currency=COALESCE\(\$6,currency\)/i);
  assert.deepEqual(calls[0].params, [30, 25, 'PEP', null, 'prefix', 'EUR', 3]);
});

test('system preferences reject an unsupported currency before querying', async () => {
  const calls = mockQueries([]);
  const res = response();

  await companyController.updateSystemPreferences({
    body: { announcement_expiry_days: 30, default_records_per_page: 25, employee_code_prefix: 'EMP-', currency: 'ZZZ' },
    user: { company_id: 3 }
  }, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /valid ISO currency/i);
  assert.equal(calls.length, 0);
});

test('older system preference clients preserve the selected currency', async () => {
  const calls = mockQueries([{ rows: [{ currency: 'CAD', currency_symbol: '$', currency_symbol_position: 'prefix' }] }]);
  const res = response();

  await companyController.updateSystemPreferences({
    body: { announcement_expiry_days: 45, default_records_per_page: 50, employee_code_prefix: 'TEAM-', currency_symbol: '$', currency_symbol_position: 'prefix' },
    user: { company_id: 4 }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.currency, 'CAD');
  assert.deepEqual(calls[0].params, [45, 50, 'TEAM-', '$', 'prefix', null, 4]);
});

test('authenticated staff can read safe company preferences', async () => {
  const calls = mockQueries([{ rows: [{ currency: 'JPY', locale: 'ja-JP', default_records_per_page: 25 }] }]);
  const res = response();

  await companyController.getSystemPreferences({ user: { company_id: 7, role: 'employee' } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.currency, 'JPY');
  assert.match(calls[0].text, /^SELECT currency, locale/i);
  assert.deepEqual(calls[0].params, [7]);
});

test('financial dashboard responses omit stored receipt bytes', async () => {
  const calls = mockQueries([
    { rows: [{ total: '0', paid_count: '0', record_count: '0' }] },
    { rows: [] },
    { rows: [] },
    { rows: [] },
    { rows: [] },
    { rows: [] }
  ]);

  await financialsController.getSummary({
    query: { month: '8', year: '2026' },
    user: { company_id: 3 }
  }, response());
  await financialsController.listTransactions({
    query: { month: '8', year: '2026' },
    user: { company_id: 3 }
  }, response());

  const transactionQueries = calls.filter(call => /FROM financial_transactions/i.test(call.text));
  assert.ok(transactionQueries.some(call => /receipt_name/i.test(call.text)));
  transactionQueries.forEach(call => assert.doesNotMatch(call.text, /\breceipt_data\b/i));
});

test('financial summary keeps every paid expense category in the expense mix', async () => {
  const calls = mockQueries([
    { rows: [{ total: '0', paid_count: '0', record_count: '0' }] },
    { rows: [
      { transaction_type: 'income', category: 'cash_income', total: '4000.00' },
      { transaction_type: 'expense', category: 'rent', total: '1200.00' },
      { transaction_type: 'expense', category: 'utilities', total: '325.50' },
      { transaction_type: 'expense', category: 'vehicle_fuel', total: '89.25' },
      { transaction_type: 'expense', category: 'other', total: '10.00' }
    ] },
    { rows: [] },
    { rows: [] },
    { rows: [] }
  ]);
  const res = response();

  await financialsController.getSummary({
    query: { month: '8', year: '2026' },
    user: { company_id: 3 }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.transactions.expense, 1624.75);
  assert.deepEqual(res.body.transactions.by_category, {
    rent: 1200,
    utilities: 325.5,
    vehicle_fuel: 89.25,
    other: 10
  });
  assert.match(calls[1].text, /GROUP BY transaction_type, category/i);
});

test('monthly cash flow returns paid weekly totals for the selected period', async () => {
  const calls = mockQueries([{ rows: [
    { week_number: '1', transaction_type: 'income', total: '1500.25' },
    { week_number: '1', transaction_type: 'expense', total: '425.50' },
    { week_number: '5', transaction_type: 'expense', total: '99.75' }
  ] }]);
  const res = response();

  await financialsController.getCashFlow({
    query: { month: '8', year: '2026' },
    user: { company_id: 3 }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.period, { year: 2026, month: 8 });
  assert.equal(res.body.buckets.length, 5);
  assert.deepEqual(res.body.buckets[0], { week: 1, start_day: 1, end_day: 7, income: 1500.25, expense: 425.5 });
  assert.deepEqual(res.body.buckets[4], { week: 5, start_day: 29, end_day: 31, income: 0, expense: 99.75 });
  assert.match(calls[0].text, /status='paid'/i);
  assert.deepEqual(calls[0].params, [3, 2026, 8]);
});

test('monthly cash flow rejects an invalid reporting period before querying', async () => {
  const calls = mockQueries([]);
  const res = response();

  await financialsController.getCashFlow({
    query: { month: '13', year: '2026' },
    user: { company_id: 3 }
  }, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /valid month and year/i);
  assert.equal(calls.length, 0);
});

test('financial transactions reject a blank amount', async () => {
  const calls = mockQueries([]);
  const res = response();

  await financialsController.createTransaction({
    body: {
      transaction_type: 'expense',
      category: 'utilities',
      transaction_date: '2026-08-23',
      title: 'Electricity bill',
      amount: '',
      payment_method: 'bank',
      status: 'pending'
    },
    user: { id: 7, company_id: 3 }
  }, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /valid non-negative amount/i);
  assert.equal(calls.length, 0);
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
  const { client, poolCalls, transactionCalls } = mockTransaction([
    { rows: [] },
    { rows: [{ currency: 'USD' }] },
    { rows: [] },
    { rows: [{ id: 4, salary: 4000, allowances: '200.00' }, { id: 5, salary: 5000, allowances: '250.00' }] },
    { rows: [] }, { rows: [] }, { rows: [] }
  ], [{ rows: [] }, { rows: [] }]);
  const res = response();
  await payrollController.processMonth({ body: { month: 7, year: 2026 }, user: { company_id: 1, role: 'admin' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.count, 2);
  assert.equal(transactionCalls.filter(call => /INSERT INTO payroll/.test(call.text)).length, 2);
  assert.equal(poolCalls.filter(call => /INSERT INTO notifications/.test(call.text)).length, 2);
  assert.equal(transactionCalls.at(-1).text, 'COMMIT');
  assert.equal(client.released, true);
});

test('payroll processing preserves the selected currency precision', async () => {
  const { client, transactionCalls } = mockTransaction([
    { rows: [] },
    { rows: [{ currency: 'KWD' }] },
    { rows: [] },
    { rows: [{
      id: 4,
      salary: '1000.1234',
      allowances: '50.006',
      overtime_hours: '1.25',
      overtime_pay: '1.235',
      benefit_deductions: '2.3456',
      loan_deductions: '3.4567'
    }] },
    { rows: [] }, { rows: [] }, { rows: [] }
  ], [{ rows: [] }]);
  const res = response();
  await payrollController.processMonth({ body: { month: 7, year: 2026 }, user: { company_id: 1, role: 'admin' } }, res);

  assert.equal(res.statusCode, 200);
  const employeeQuery = transactionCalls.find(call => /FROM employees e/.test(call.text));
  assert.ok(employeeQuery);
  assert.deepEqual(employeeQuery.params, [7, 2026, 1, 0.05, 3]);
  assert.match(employeeQuery.text, /ROUND\(e\.salary \* \$4::numeric, \$5::int\) AS allowances/i);
  const insert = transactionCalls.find(call => /INSERT INTO payroll/.test(call.text));
  assert.ok(insert);
  assert.match(insert.text, /\$18::numeric \+ \$16::numeric \+ \$17::numeric/i);
  assert.equal(insert.params[5], '50.006');
  assert.equal(insert.params[7], '1.235');
  assert.equal(insert.params[15], '2.3456');
  assert.equal(insert.params[16], '3.4567');
  assert.equal(insert.params[17], 119.903);
  const loanUpdate = transactionCalls.find(call => /UPDATE employee_loans/.test(call.text));
  assert.ok(loanUpdate);
  assert.deepEqual(loanUpdate.params, [1, 4, 7, 2026]);
  assert.equal(transactionCalls.at(-1).text, 'COMMIT');
  assert.equal(client.released, true);
});

test('payroll processing blocks an invalid company currency', async () => {
  const { client, poolCalls, transactionCalls } = mockTransaction([
    { rows: [] },
    { rows: [{ currency: 'ZZZ' }] },
    { rows: [] }
  ]);
  const res = response();
  await payrollController.processMonth({ body: { month: 7, year: 2026 }, user: { company_id: 1, role: 'admin' } }, res);

  assert.equal(res.statusCode, 409);
  assert.match(res.body.error, /base currency in Settings/i);
  assert.equal(transactionCalls.at(-1).text, 'ROLLBACK');
  assert.equal(poolCalls.length, 0);
  assert.equal(client.released, true);
});
