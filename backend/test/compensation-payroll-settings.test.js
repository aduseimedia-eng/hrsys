const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../config/db');
const compensationController = require('../controllers/compensation.controller');

const originalGetClient = db.getClient;
const originalQuery = db.query;

function response() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

function effectiveRules() {
  return [
    {
      code: 'GH-SSNIT', name: 'SSNIT', version: 'SSNIT-TEST',
      employee_rate: '0.055', employer_rate: '0.13', maximum_amount: '5750', tax_brackets: []
    },
    {
      code: 'GH-PAYE', name: 'PAYE', version: 'PAYE-TEST',
      tax_brackets: [{ lower_bound: 0, upper_bound: null, rate: '0.10', fixed_amount: 0 }]
    }
  ];
}

function installSaveClient({ current = { id: 20, effective_from: '2026-01-01' } } = {}) {
  const calls = [];
  const client = {
    async query(text, params) {
      calls.push({ text, params });
      if (/SELECT e\.id, payroll_context\.country_code/i.test(text)) {
        return { rows: [{ id: 14, country_code: 'GH', currency_code: 'GHS' }] };
      }
      if (/FROM statutory_rules sr/i.test(text)) return { rows: effectiveRules() };
      if (/SELECT id,to_char\(effective_from/i.test(text)) return { rows: current ? [current] : [] };
      if (/INSERT INTO salary_records/i.test(text)) {
        return { rows: [{ id: 21, employee_id: 14, effective_status: 'scheduled' }] };
      }
      return { rows: [] };
    },
    release() {}
  };
  db.getClient = async () => client;
  return { calls, client };
}

test.afterEach(() => {
  db.getClient = originalGetClient;
  db.query = originalQuery;
});

test('staff changes use effective company payroll rules and create an audited salary snapshot', async () => {
  const { calls } = installSaveClient();
  const res = response();

  await compensationController.set({
    user: { id: 3, company_id: 7 },
    body: {
      employee_id: 14,
      basic_salary: '5000',
      allowances: '300',
      ssnit_insurable_salary: '4800',
      other_deductions: '125',
      effective_from: '2026-10-01',
      ssnit_exempt: true,
      paye_exempt: false,
      change_reason: 'Approved recurring welfare deduction'
    }
  }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.rule_set_version, 'SSNIT-TEST,PAYE-TEST');
  assert.equal(res.body.effective_status, 'scheduled');

  const contextQuery = calls.find(call => /payroll_context\.country_code/i.test(call.text));
  assert.deepEqual(contextQuery.params, [14, 7, '2026-10-01']);
  assert.match(contextQuery.text, /pp\.company_id=e\.company_id/i);
  assert.match(contextQuery.text, /pp\.effective_from <= \$3/i);

  const rulesQuery = calls.find(call => /FROM statutory_rules sr/i.test(call.text));
  assert.deepEqual(rulesQuery.params, ['GH', '2026-10-01', 7]);

  const salaryInsert = calls.find(call => /INSERT INTO salary_records/i.test(call.text));
  assert.deepEqual(salaryInsert.params.slice(2, 13), [
    '5000', '300', '4800', '5300', '0', '0', '0', '0', '530', '125', '4645'
  ]);
  assert.equal(salaryInsert.params[15], true);
  assert.equal(salaryInsert.params[16], false);

  const employeeUpdate = calls.find(call => /UPDATE employees SET salary/i.test(call.text));
  assert.deepEqual(employeeUpdate.params, ['5000', 14, 7, '2026-10-01']);
  assert.match(employeeUpdate.text, /\$4::date <= CURRENT_DATE/i);

  const auditInsert = calls.find(call => /INSERT INTO audit_logs/i.test(call.text));
  assert.deepEqual(auditInsert.params, [7, 3, 21, 'Approved recurring welfare deduction']);
  assert.ok(calls.findIndex(call => /INSERT INTO audit_logs/i.test(call.text)) < calls.findIndex(call => call.text === 'COMMIT'));
});

test('staff deductions producing a negative effective-rule net are rejected before persistence', async () => {
  const { calls } = installSaveClient({ current: null });
  const res = response();

  await compensationController.set({
    user: { id: 3, company_id: 7 },
    body: {
      employee_id: 14,
      basic_salary: '1000',
      allowances: '0',
      other_deductions: '2000',
      effective_from: '2026-10-01'
    }
  }, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /deductions cannot exceed net earnings/i);
  assert.equal(calls.some(call => /INSERT INTO salary_records/i.test(call.text)), false);
  assert.equal(calls.at(-1).text, 'ROLLBACK');
});

test('staff payroll settings reject impossible effective dates before querying', async () => {
  let connected = false;
  db.getClient = async () => { connected = true; throw new Error('should not connect'); };
  const res = response();

  await compensationController.set({
    user: { id: 3, company_id: 7 },
    body: {
      employee_id: 14,
      basic_salary: 1000,
      allowances: 0,
      other_deductions: 0,
      effective_from: '2026-02-30'
    }
  }, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /real effective date/i);
  assert.equal(connected, false);
});

test('preview uses the employee company scope and rule versions effective on the requested date', async () => {
  const calls = [];
  db.query = async (text, params) => {
    calls.push({ text, params });
    if (/FROM employee_payroll_profiles pp/i.test(text)) {
      return { rows: [{ country_code: 'GH', currency_code: 'GHS' }] };
    }
    if (/FROM statutory_rules sr/i.test(text)) return { rows: effectiveRules() };
    return { rows: [] };
  };
  const res = response();

  await compensationController.preview({
    user: { id: 3, company_id: 7 },
    body: {
      employee_id: 14,
      basic_salary: '5000',
      allowances: '0',
      other_deductions: '0',
      effective_from: '2026-10-01'
    }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.gross, 5000);
  assert.equal(res.body.ssnitEmployee, 275);
  assert.equal(res.body.payeTax, 472.5);
  assert.equal(res.body.net, 4252.5);
  assert.equal(res.body.rule_set_version, 'SSNIT-TEST,PAYE-TEST');
  assert.deepEqual(calls[0].params, [7, 14, '2026-10-01']);
  assert.deepEqual(calls[1].params, ['GH', '2026-10-01', 7]);
});

test('preview reports a friendly conflict when no effective payroll profile exists', async () => {
  db.query = async () => ({ rows: [] });
  const res = response();

  await compensationController.preview({
    user: { id: 3, company_id: 7 },
    body: { employee_id: 14, basic_salary: 1000, effective_from: '2026-10-01' }
  }, res);

  assert.equal(res.statusCode, 409);
  assert.match(res.body.error, /active payroll profile/i);
});
