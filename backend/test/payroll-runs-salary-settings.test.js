const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../config/db');
const payrollRunsController = require('../controllers/payroll-runs.controller');

const originalGetClient = db.getClient;

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
      code: 'GH-SSNIT', name: 'SSNIT', version: 'GH-SSNIT-TEST',
      employee_rate: '0.055', employer_rate: '0.13', maximum_amount: '5750',
      statutory_rule_id: 11, statutory_rule_version_id: 111, tax_brackets: []
    },
    {
      code: 'GH-PAYE', name: 'PAYE', version: 'GH-PAYE-TEST',
      statutory_rule_id: 12, statutory_rule_version_id: 122,
      tax_brackets: [{ lower_bound: 0, upper_bound: null, rate: '0.10', fixed_amount: 0 }]
    }
  ];
}

function installCalculationClient(profile) {
  const calls = [];
  const client = {
    released: false,
    async query(text, params) {
      calls.push({ text, params });
      if (/FROM payroll_runs pr/i.test(text)) {
        return { rows: [{
          id: 91, company_id: 77, pay_group_id: 3, country_code: 'GH', currency_code: 'GHS',
          period_end: '2026-08-31', status: 'draft'
        }] };
      }
      if (/FROM employee_payroll_profiles pp/i.test(text)) return { rows: [profile] };
      if (/FROM statutory_rules sr/i.test(text)) return { rows: effectiveRules() };
      if (/INSERT INTO payroll_results/i.test(text)) return { rows: [{ id: 501 }] };
      if (/UPDATE payroll_runs SET status='calculated'/i.test(text)) return { rows: [{ id: 91, status: 'calculated' }] };
      return { rows: [] };
    },
    release() { this.released = true; }
  };
  db.getClient = async () => client;
  return { calls, client };
}

test.afterEach(() => {
  db.getClient = originalGetClient;
});

test('payroll run resolves and consumes the salary record effective on the run end date', async () => {
  const { calls, client } = installCalculationClient({
    employee_id: 22,
    salary: '9000.00',
    basic_salary: '5000.00',
    allowances: '200.00',
    ssnit_insurable_salary: '4000.00',
    other_deductions: '125.55',
    ssnit_exempt: true,
    paye_exempt: true
  });
  const res = response();

  await payrollRunsController.calculate({ user: { id: 5, company_id: 77 }, params: { id: 91 } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.employee_count, 1);
  assert.equal(client.released, true);

  const profileQuery = calls.find((call) => /FROM employee_payroll_profiles pp/i.test(call.text));
  assert.ok(profileQuery);
  assert.deepEqual(profileQuery.params, [77, 3, '2026-08-31']);
  assert.match(profileQuery.text, /LEFT JOIN LATERAL/i);
  assert.match(profileQuery.text, /sr\.effective_from <= \$3/i);
  assert.match(profileQuery.text, /sr\.effective_to IS NULL OR sr\.effective_to >= \$3/i);
  assert.match(profileQuery.text, /COALESCE\(comp\.basic_salary, e\.salary\) AS basic_salary/i);
  assert.match(profileQuery.text, /COALESCE\(comp\.ssnit_exempt, false\) AS ssnit_exempt/i);
  assert.match(profileQuery.text, /COALESCE\(comp\.paye_exempt, false\) AS paye_exempt/i);

  const resultInsert = calls.find((call) => /INSERT INTO payroll_results/i.test(call.text));
  assert.ok(resultInsert);
  assert.deepEqual(resultInsert.params.slice(3, 17), [
    '5200', '5200', '4000', '0', '0', '0', '125.55', '0', '0', '0', '0', '125.55', '5074.45', '5200'
  ]);

  const lineInserts = calls.filter((call) => /INSERT INTO payroll_line_items/i.test(call.text));
  const employeeSsnit = lineInserts.find((call) => call.params[2] === 'GH-SSNIT' && call.params[5] === 'employee');
  const paye = lineInserts.find((call) => call.params[2] === 'GH-PAYE');
  const other = lineInserts.find((call) => call.params[2] === 'OTHER-DEDUCTION');
  assert.deepEqual(employeeSsnit.params.slice(-2), [11, 111]);
  assert.deepEqual(paye.params.slice(-2), [12, 122]);
  assert.deepEqual(other.params.slice(2), ['OTHER-DEDUCTION', 'Other deductions', '125.55', 'employee', false, false, null, null]);
});

test('payroll run falls back to the employee salary when no effective salary record exists', async () => {
  const { calls } = installCalculationClient({
    employee_id: 33,
    salary: '3000.00',
    basic_salary: null,
    allowances: null,
    ssnit_insurable_salary: null,
    other_deductions: null,
    ssnit_exempt: false,
    paye_exempt: false
  });
  const res = response();

  await payrollRunsController.calculate({ user: { id: 5, company_id: 77 }, params: { id: 91 } }, res);

  assert.equal(res.statusCode, 200);
  const resultInsert = calls.find((call) => /INSERT INTO payroll_results/i.test(call.text));
  assert.equal(resultInsert.params[3], '3000');
  assert.equal(resultInsert.params[5], '3000');
  assert.equal(resultInsert.params[7], '165');
  assert.equal(resultInsert.params[9], '0');
  assert.equal(calls.some((call) => /INSERT INTO payroll_line_items/i.test(call.text) && call.params[2] === 'OTHER-DEDUCTION'), false);
});

test('payroll run rolls back with a friendly error instead of persisting a negative net result', async () => {
  const { calls, client } = installCalculationClient({
    employee_id: 44,
    salary: '1000.00',
    basic_salary: '1000.00',
    allowances: '0',
    ssnit_insurable_salary: '1000.00',
    other_deductions: '2000.00',
    ssnit_exempt: false,
    paye_exempt: false
  });
  const res = response();

  await payrollRunsController.calculate({ user: { id: 5, company_id: 77 }, params: { id: 91 } }, res);

  assert.equal(res.statusCode, 422);
  assert.match(res.body.error, /deductions exceed gross pay for employee 44/i);
  assert.equal(calls.some((call) => /INSERT INTO payroll_results/i.test(call.text)), false);
  assert.equal(calls.at(-1).text, 'ROLLBACK');
  assert.equal(client.released, true);
});
